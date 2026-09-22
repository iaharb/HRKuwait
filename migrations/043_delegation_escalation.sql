-- 043: Delegation & escalation rules for wf_resolve_actors2 (docs/workflow_engine_design_v2.md §6.4).
--
-- Implements the three reserved rule_config keys:
--   delegate_to_role    → resolve to a different role (e.g. FD→CEO when FD is OOO)
--   escalate_after_hours → after N hours pending, escalate to another role
--   escalate_to_rule     → use a different resolution rule for escalation
--
-- These are schema-ready (stored in rule_config JSONB); no new tables/columns needed.

-- We extend wf_resolve_actors2 by REPLACING it with the extended version.
-- Idempotent: re-runnable.

DROP FUNCTION IF EXISTS wf_resolve_actors2(UUID, UUID, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION wf_resolve_actors2(
    p_requester_id UUID,
    p_deputy_id    UUID,
    p_rule         TEXT,
    p_role_code    TEXT,
    p_rule_config  JSONB
)
RETURNS SETOF la_users
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    req    la_users%ROWTYPE;
    ctx    RECORD;
    cur    UUID;
    i      INT;
    lvl    INT;
    heads  UUID[] := ARRAY[]::uuid[];
    h      UUID;
    v_esc_role TEXT;
    v_esc_hours INT;
    v_esc_rule TEXT;
    v_step_created_at TIMESTAMPTZ;
BEGIN
    SELECT * INTO req FROM la_users WHERE id = p_requester_id;
    IF req.id IS NULL THEN RETURN; END IF;

    -- NEW: delegation to a different role
    IF p_rule = 'delegate_to_role' THEN
        v_esc_role := p_rule_config->>'delegate_to_role';
        IF v_esc_role IS NOT NULL THEN
            RETURN QUERY
            SELECT u.* FROM la_users u
            JOIN wf_user_roles ur ON ur.user_id = u.id
            WHERE ur.role_code = v_esc_role
              AND u.status = 'active'
              AND (ur.department_scope IS NULL OR ur.department_scope = req.department);
            RETURN;
        END IF;
        -- Fall through to role if delegate_to_role not set
    END IF;

    -- NEW: escalation after N hours (checked at step resolution time)
    -- NOTE: escalation check requires knowing the step's created_at.
    -- This is evaluated in wf_start_request / wf_step_decision when the step becomes PENDING.
    -- The resolver just knows the rule; the calling context applies the time check.
    IF p_rule = 'escalate_after_hours' THEN
        -- This rule is a marker; actual escalation happens in wf_step_decision / wf_start_request
        -- by checking step_created_at vs now() - interval. The escalation target is in
        -- escalate_to_rule or escalate_to_role.
        v_esc_hours := COALESCE((p_rule_config->>'escalate_after_hours')::int, 0);
        v_esc_role := p_rule_config->>'escalate_to_role';
        v_esc_rule := p_rule_config->>'escalate_to_rule';

        -- If escalation conditions met (checked by caller), resolve via target rule/role
        IF v_esc_role IS NOT NULL THEN
            RETURN QUERY
            SELECT u.* FROM la_users u
            JOIN wf_user_roles ur ON ur.user_id = u.id
            WHERE ur.role_code = v_esc_role
              AND u.status = 'active'
              AND (ur.department_scope IS NULL OR ur.department_scope = req.department);
            RETURN;
        ELSIF v_esc_rule IS NOT NULL THEN
            -- Recursively resolve via the escalation rule
            RETURN QUERY
            SELECT * FROM wf_resolve_actors2(p_requester_id, p_deputy_id, v_esc_rule, p_role_code, p_rule_config);
            RETURN;
        END IF;
        -- Fall through to role if no escalation configured
    END IF;

    -- NEW: escalate_to_rule - used directly as a rule (not just inside escalate_after_hours)
    IF p_rule = 'escalate_to_rule' THEN
        v_esc_rule := p_rule_config->>'escalate_to_rule';
        IF v_esc_rule IS NOT NULL THEN
            RETURN QUERY
            SELECT * FROM wf_resolve_actors2(p_requester_id, p_deputy_id, v_esc_rule, p_role_code, p_rule_config);
            RETURN;
        END IF;
    END IF;

    IF p_rule = 'requester' THEN
        RETURN QUERY SELECT * FROM la_users WHERE id = p_requester_id; RETURN;

    ELSIF p_rule = 'specific_user' THEN
        IF p_rule_config ? 'user_id' THEN
            RETURN QUERY SELECT * FROM la_users WHERE id = (p_rule_config->>'user_id')::uuid;
        END IF; RETURN;

    ELSIF p_rule = 'requester_replacement' THEN
        IF p_deputy_id IS NOT NULL THEN
            RETURN QUERY SELECT * FROM la_users WHERE id = p_deputy_id;
        END IF; RETURN;

    ELSIF p_rule = 'line_manager' THEN
        lvl := COALESCE((p_rule_config->>'level')::int, 1);
        cur := req.manager_id;
        FOR i IN 1..lvl LOOP
            EXIT WHEN cur IS NULL;
            IF i = lvl THEN
                RETURN QUERY SELECT * FROM la_users WHERE id = cur AND status = 'active';
                RETURN;
            END IF;
            SELECT manager_id INTO cur FROM la_users WHERE id = cur;
        END LOOP; RETURN;

    ELSIF p_rule IN ('unit_head','supervision_head','department_head','division_head') THEN
        SELECT * INTO ctx FROM wf_org_context(p_requester_id);
        cur := CASE p_rule
                 WHEN 'unit_head'        THEN ctx.unit_head_id
                 WHEN 'supervision_head' THEN ctx.supervision_head_id
                 WHEN 'department_head'  THEN ctx.department_head_id
                 ELSE ctx.division_head_id
               END;
        IF cur IS NOT NULL THEN
            RETURN QUERY SELECT * FROM la_users WHERE id = cur AND status = 'active';
        END IF; RETURN;

    ELSIF p_rule = 'reporting_chain' THEN
        lvl := GREATEST(COALESCE((p_rule_config->>'level')::int, 1), 1);
        SELECT * INTO ctx FROM wf_org_context(p_requester_id);
        FOREACH h IN ARRAY ARRAY[ctx.unit_head_id, ctx.supervision_head_id,
                                  ctx.department_head_id, ctx.division_head_id] LOOP
            EXIT WHEN array_length(heads,1) >= lvl;
            IF h IS NOT NULL AND NOT (h = ANY(heads)) THEN heads := heads || h; END IF;
        END LOOP;
        cur := req.manager_id;
        WHILE array_length(heads,1) < lvl AND cur IS NOT NULL LOOP
            IF NOT (cur = ANY(heads)) THEN heads := heads || cur; END IF;
            SELECT manager_id INTO cur FROM la_users WHERE id = cur;
        END LOOP;
        FOREACH h IN ARRAY heads LOOP
            RETURN QUERY SELECT * FROM la_users WHERE id = h AND status = 'active';
        END LOOP; RETURN;

    ELSE -- 'role' (and default)
        RETURN QUERY
        SELECT u.* FROM la_users u
        JOIN wf_user_roles ur ON ur.user_id = u.id
        WHERE ur.role_code = p_role_code
          AND u.status = 'active'
          AND (ur.department_scope IS NULL OR ur.department_scope = req.department);
        RETURN;
    END IF;
END; $$;

GRANT EXECUTE ON FUNCTION wf_resolve_actors2(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated, service_role;