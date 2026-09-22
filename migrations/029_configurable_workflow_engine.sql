-- ============================================================================
-- 029 — CONFIGURABLE WORKFLOW ENGINE  (metadata-driven, per organization)
-- ----------------------------------------------------------------------------
-- Turns the hardcoded leave approval chain (migration 025) into DATA:
--   wf_roles        — the org's role catalog  (e.g. Emp, DM, HR, FD, CEO)
--   wf_user_roles   — which users hold which roles
--   wf_flows        — named, versioned workflows (e.g. "Leave", "Sick Leave")
--   wf_flow_steps   — ordered steps; each step names the role that acts
--
-- A request pins a flow + version and tracks the current step. The generic
-- engine (la_start_request / la_step_decision / la_workflow_action_queue) is
-- driven entirely by those tables, so a new deployment just seeds config.
--
-- This migration is ADDITIVE: existing la_* tables, columns and RPCs are left
-- untouched, so the live leave app keeps working. No org config is seeded here —
-- use scripts/load_workflow_config.cjs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Org scope. One deploy per organization; org_id is carried (not enforced)
--    so a future shared/multi-tenant deployment needs no redesign.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_default_org()
RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid; $$;

-- ---------------------------------------------------------------------------
-- 1. CONFIGURATION TABLES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wf_roles (
    org_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    code         TEXT NOT NULL,
    name         TEXT,
    rank         INTEGER NOT NULL DEFAULT 0,
    is_approver  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (org_id, code)
);

CREATE TABLE IF NOT EXISTS wf_user_roles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    user_id           UUID NOT NULL REFERENCES la_users(id) ON DELETE CASCADE,
    role_code         TEXT NOT NULL,
    department_scope  TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, user_id, role_code)
);

CREATE TABLE IF NOT EXISTS wf_flows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'draft', 'archived')),
    applies_to      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"leave_types":["Sick"]}
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, code, version)
);

CREATE TABLE IF NOT EXISTS wf_flow_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id         UUID NOT NULL REFERENCES wf_flows(id) ON DELETE CASCADE,
    step_order      INTEGER NOT NULL,
    code            TEXT NOT NULL,
    name            TEXT,
    actor_role_code TEXT,
    step_type       TEXT NOT NULL DEFAULT 'approval'
                    CHECK (step_type IN ('init', 'approval', 'review', 'acknowledge', 'auto')),
    rule            TEXT NOT NULL DEFAULT 'role',   -- role | requester | line_manager | ...
    rule_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
    condition       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"min_days":3,"leave_type":"Sick"}
    is_required     BOOLEAN NOT NULL DEFAULT TRUE,
    allow_self      BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (flow_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_wf_user_roles_user ON wf_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_flow_steps_flow ON wf_flow_steps(flow_id, step_order);

-- ---------------------------------------------------------------------------
-- 2. RUNTIME: pin a flow to a request, and snapshot its steps
-- ---------------------------------------------------------------------------
ALTER TABLE la_leave_requests ADD COLUMN IF NOT EXISTS flow_id      UUID;
ALTER TABLE la_leave_requests ADD COLUMN IF NOT EXISTS flow_version INTEGER;
ALTER TABLE la_leave_requests ADD COLUMN IF NOT EXISTS current_step INTEGER;

-- NOTE: la_leave_requests.deputy_id doubles as the ad hoc replacement field.

CREATE TABLE IF NOT EXISTS la_request_steps (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id        UUID NOT NULL REFERENCES la_leave_requests(id) ON DELETE CASCADE,
    flow_id           UUID,
    flow_version      INTEGER,
    step_order        INTEGER NOT NULL,
    code              TEXT,
    name              TEXT,
    actor_role_code   TEXT,
    rule              TEXT,
    resolved_actor_id UUID REFERENCES la_users(id),
    status            TEXT NOT NULL DEFAULT 'WAITING'
                      CHECK (status IN ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED')),
    decided_by        UUID REFERENCES la_users(id),
    decided_at        TIMESTAMPTZ,
    note              TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (request_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_la_request_steps_req    ON la_request_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_la_request_steps_pending ON la_request_steps(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_la_request_steps_actor  ON la_request_steps(resolved_actor_id) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- 3. RESOLUTION HELPERS
-- ---------------------------------------------------------------------------

-- Pick the active flow for a leave type: a specific match wins over a catch-all.
CREATE OR REPLACE FUNCTION wf_resolve_flow(p_leave_type TEXT)
RETURNS wf_flows
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE f wf_flows%ROWTYPE;
BEGIN
    SELECT * INTO f
    FROM wf_flows
    WHERE org_id = wf_default_org() AND status = 'active'
      AND (applies_to = '{}'::jsonb OR applies_to->'leave_types' ? p_leave_type)
    ORDER BY (applies_to->'leave_types' ? p_leave_type) DESC,
             version DESC, effective_from DESC
    LIMIT 1;
    RETURN f;
END; $$;

-- Does a step apply given the request's days + leave type?
CREATE OR REPLACE FUNCTION wf_step_applies(p_days NUMERIC, p_leave_type TEXT, p_condition JSONB)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
    SELECT (p_condition IS NULL OR p_condition = '{}'::jsonb)
       AND (p_condition->>'min_days' IS NULL OR p_days >= (p_condition->>'min_days')::numeric)
       AND (p_condition->>'max_days' IS NULL OR p_days <= (p_condition->>'max_days')::numeric)
       AND (p_condition->>'leave_type' IS NULL OR p_condition->>'leave_type' = p_leave_type);
$$;

-- Resolve the eligible actors for a step (any-of-N). Driven by `rule`.
CREATE OR REPLACE FUNCTION wf_resolve_actors(
    p_request_id  UUID,
    p_rule        TEXT,
    p_role_code   TEXT,
    p_rule_config JSONB
)
RETURNS SETOF la_users
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r   la_leave_requests%ROWTYPE;
    req la_users%ROWTYPE;
    lvl INT;
    cur UUID;
    i   INT;
BEGIN
    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN; END IF;
    SELECT * INTO req FROM la_users WHERE id = r.requester_id;

    IF p_rule = 'requester' THEN
        RETURN QUERY SELECT * FROM la_users WHERE id = r.requester_id;
        RETURN;
    ELSIF p_rule = 'line_manager' THEN
        lvl := COALESCE((p_rule_config->>'level')::int, 1);
        cur := req.manager_id;
        FOR i IN 1..lvl LOOP
            EXIT WHEN cur IS NULL;
            IF i = lvl THEN
                RETURN QUERY SELECT * FROM la_users WHERE id = cur;
                RETURN;
            END IF;
            SELECT manager_id INTO cur FROM la_users WHERE id = cur;
        END LOOP;
        RETURN;
    ELSIF p_rule = 'requester_replacement' THEN
        IF r.deputy_id IS NOT NULL THEN
            RETURN QUERY SELECT * FROM la_users WHERE id = r.deputy_id;
        END IF;
        RETURN;
    ELSIF p_rule = 'specific_user' THEN
        IF p_rule_config->>'user_id' IS NOT NULL THEN
            RETURN QUERY SELECT * FROM la_users WHERE id = (p_rule_config->>'user_id')::uuid;
        END IF;
        RETURN;
    ELSIF p_rule = 'department_head' THEN
        -- Highest-ranked active approver in the requester's department.
        RETURN QUERY
        SELECT u.* FROM la_users u
        JOIN wf_user_roles ur ON ur.user_id = u.id
        JOIN wf_roles ro ON ro.org_id = ur.org_id AND ro.code = ur.role_code
        WHERE u.status = 'active' AND ro.is_approver
          AND req.department IS NOT NULL AND u.department = req.department
        ORDER BY ro.rank DESC
        LIMIT 1;
        RETURN;
    ELSE  -- 'role' (default)
        RETURN QUERY
        SELECT u.* FROM la_users u
        JOIN wf_user_roles ur ON ur.user_id = u.id
        WHERE ur.role_code = p_role_code
          AND u.status = 'active'
          AND (ur.department_scope IS NULL OR ur.department_scope = req.department);
        RETURN;
    END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 4. NOTIFY every eligible actor for the request's current step
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_notify_current_actors(p_request_id UUID, p_title TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r  la_leave_requests%ROWTYPE;
    fs wf_flow_steps%ROWTYPE;
    req la_users%ROWTYPE;
    a  la_users%ROWTYPE;
BEGIN
    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL OR r.current_step IS NULL THEN RETURN; END IF;

    SELECT * INTO fs FROM wf_flow_steps WHERE flow_id = r.flow_id AND step_order = r.current_step;
    SELECT * INTO req FROM la_users WHERE id = r.requester_id;

    FOR a IN SELECT * FROM wf_resolve_actors(r.id, fs.rule, fs.actor_role_code, fs.rule_config) LOOP
        PERFORM la_notify(a.id, p_title,
            format('%s requests %s leave from %s to %s. Awaiting the "%s" step.',
                   req.full_name, r.leave_type, r.start_date, r.end_date, COALESCE(fs.name, fs.code)));
    END LOOP;
END; $$;

-- ---------------------------------------------------------------------------
-- 5. ENGINE — start a request from config
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION la_start_request(
    p_leave_type  TEXT,
    p_start_date  DATE,
    p_end_date    DATE,
    p_reason      TEXT,
    p_contact     TEXT,
    p_deputy_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u      la_users%ROWTYPE;
    f      wf_flows%ROWTYPE;
    st     wf_flow_steps%ROWTYPE;
    v_id   UUID := gen_random_uuid();
    v_days NUMERIC;
    v_actor UUID;
    v_status TEXT;
    v_cur  INTEGER;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.');
    END IF;

    IF p_start_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'message', 'Start date cannot be in the past.');
    END IF;
    IF p_end_date < p_start_date THEN
        RETURN jsonb_build_object('success', false, 'message', 'End date must be on or after the start date.');
    END IF;
    IF p_deputy_id IS NOT NULL AND p_deputy_id = u.id THEN
        RETURN jsonb_build_object('success', false, 'message', 'The replacement cannot be the requester.');
    END IF;

    v_days := la_count_working_days(p_start_date, p_end_date);

    f := wf_resolve_flow(p_leave_type);
    IF f.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message',
            format('No workflow is configured for "%s" leave.', p_leave_type));
    END IF;

    INSERT INTO la_leave_requests (
        id, requester_id, leave_type, start_date, end_date, days, reason,
        contact_during, deputy_id, status, history, flow_id, flow_version
    ) VALUES (
        v_id, u.id, p_leave_type, p_start_date, p_end_date, v_days, p_reason,
        p_contact, p_deputy_id, 'PENDING',
        jsonb_build_array(jsonb_build_object(
            'at', now(), 'actor', u.full_name, 'action', 'Submitted leave request',
            'flow', f.code, 'version', f.version
        )),
        f.id, f.version
    );

    -- Snapshot the flow's steps for this request.
    FOR st IN SELECT * FROM wf_flow_steps WHERE flow_id = f.id ORDER BY step_order LOOP
        v_actor  := NULL;
        v_status := 'WAITING';

        IF NOT wf_step_applies(v_days, p_leave_type, st.condition) THEN
            v_status := 'SKIPPED';
        ELSIF st.step_type = 'init' OR (st.rule = 'requester' AND st.step_order = 0) THEN
            -- The employee's own submit step completes immediately.
            v_status := 'APPROVED';
        ELSE
            SELECT id INTO v_actor
            FROM wf_resolve_actors(v_id, st.rule, st.actor_role_code, st.rule_config)
            LIMIT 1;

            IF v_actor IS NULL THEN
                v_status := CASE WHEN st.is_required THEN 'WAITING' ELSE 'SKIPPED' END;
            END IF;
        END IF;

        INSERT INTO la_request_steps (
            request_id, flow_id, flow_version, step_order, code, name,
            actor_role_code, rule, resolved_actor_id, status, decided_by, decided_at, note
        ) VALUES (
            v_id, f.id, f.version, st.step_order, st.code, st.name,
            st.actor_role_code, st.rule, v_actor, v_status,
            CASE WHEN v_status = 'APPROVED' AND st.step_type = 'init' THEN u.id ELSE NULL END,
            CASE WHEN v_status = 'APPROVED' AND st.step_type = 'init' THEN now() ELSE NULL END,
            CASE WHEN v_status = 'APPROVED' AND st.step_type = 'init' THEN 'Initiated' ELSE NULL END
        );
    END LOOP;

    -- First step still WAITING becomes the current actionable step.
    SELECT min(step_order) INTO v_cur
    FROM la_request_steps WHERE request_id = v_id AND status = 'WAITING';

    IF v_cur IS NULL THEN
        -- Nothing to approve (e.g. every step skipped) — finalize directly.
        UPDATE la_leave_requests SET status = 'APPROVED', current_step = NULL WHERE id = v_id;
        PERFORM la_notify(u.id, 'Leave approved',
            format('Your %s leave from %s to %s has been approved.', p_leave_type, p_start_date, p_end_date));
        RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'APPROVED',
            'message', 'Request approved — no approval steps required.');
    END IF;

    UPDATE la_request_steps SET status = 'PENDING' WHERE request_id = v_id AND step_order = v_cur;
    UPDATE la_leave_requests SET current_step = v_cur WHERE id = v_id;
    PERFORM wf_notify_current_actors(v_id, 'Approval needed');

    PERFORM la_notify(u.id, 'Leave request submitted',
        format('Your %s leave request is now in the approval workflow.', p_leave_type));

    RETURN jsonb_build_object('success', true, 'id', v_id, 'current_step', v_cur,
        'message', 'Leave request submitted.');
END; $$;

-- ---------------------------------------------------------------------------
-- 6. ENGINE — decide the current step, then advance / finalize
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION la_step_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL,
    p_final_days NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u       la_users%ROWTYPE;
    r       la_leave_requests%ROWTYPE;
    rs      la_request_steps%ROWTYPE;
    fs      wf_flow_steps%ROWTYPE;
    req     la_users%ROWTYPE;
    bal     la_leave_balances%ROWTYPE;
    v_ok    BOOLEAN;
    v_next  INTEGER;
    v_days  NUMERIC;
    v_coll  JSONB;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;

    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Request not found.'); END IF;
    IF r.current_step IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'This request has no pending step.'); END IF;

    SELECT * INTO rs FROM la_request_steps
     WHERE request_id = p_request_id AND step_order = r.current_step AND status = 'PENDING';
    IF rs.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'This request is not awaiting an action.'); END IF;

    SELECT * INTO fs FROM wf_flow_steps WHERE flow_id = r.flow_id AND step_order = rs.step_order;

    -- Authorization against the step's configured actors.
    SELECT EXISTS (
        SELECT 1 FROM wf_resolve_actors(p_request_id, fs.rule, fs.actor_role_code, fs.rule_config) a
        WHERE a.id = u.id
    ) INTO v_ok;

    IF NOT v_ok AND NOT (fs.allow_self AND u.id = r.requester_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'You are not eligible to act on this step.');
    END IF;

    SELECT * INTO req FROM la_users WHERE id = r.requester_id;

    -- Rejection terminates the flow and bounces back to the employee.
    IF NOT p_approve THEN
        UPDATE la_request_steps
           SET status = 'REJECTED', decided_by = u.id, decided_at = now(), note = p_note
         WHERE id = rs.id;
        UPDATE la_leave_requests
           SET status = 'REJECTED', current_step = NULL, rejection_reason = p_note,
               rejection_step = COALESCE(fs.code, rs.code),
               history = r.history || jsonb_build_object(
                   'at', now(), 'actor', u.full_name, 'action', 'Rejected at ' || COALESCE(fs.name, fs.code), 'note', p_note)
         WHERE id = r.id;
        PERFORM la_notify(r.requester_id, 'Leave rejected',
            format('Your %s request was rejected at the "%s" step because: %s',
                   r.leave_type, COALESCE(fs.name, fs.code), COALESCE(p_note, 'no reason given')));
        RETURN jsonb_build_object('success', true, 'message', 'Rejected. The employee has been notified.');
    END IF;

    -- Approve the current step.
    UPDATE la_request_steps
       SET status = 'APPROVED', decided_by = u.id, decided_at = now(), note = p_note
     WHERE id = rs.id;

    UPDATE la_leave_requests
       SET history = r.history || jsonb_build_object(
               'at', now(), 'actor', u.full_name, 'action', 'Approved at ' || COALESCE(fs.name, fs.code), 'note', p_note)
     WHERE id = r.id;

    -- Next applicable step.
    SELECT min(step_order) INTO v_next
    FROM la_request_steps
    WHERE request_id = r.id AND step_order > rs.step_order AND status = 'WAITING';

    IF v_next IS NOT NULL THEN
        UPDATE la_request_steps SET status = 'PENDING' WHERE request_id = r.id AND step_order = v_next;
        UPDATE la_leave_requests SET current_step = v_next WHERE id = r.id;
        PERFORM wf_notify_current_actors(r.id, 'Approval needed');
        RETURN jsonb_build_object('success', true, 'current_step', v_next, 'message', 'Approved. Forwarded to the next step.');
    END IF;

    -- Final step: finalize.
    v_days := COALESCE(p_final_days, r.days);
    IF v_days < 0 THEN v_days := 0; END IF;

    UPDATE la_leave_requests SET status = 'APPROVED', current_step = NULL, days = v_days WHERE id = r.id;

    SELECT * INTO bal FROM la_leave_balances
     WHERE user_id = r.requester_id AND leave_type = r.leave_type
       AND year = EXTRACT(YEAR FROM r.start_date)::int;
    IF bal.id IS NOT NULL THEN
        UPDATE la_leave_balances SET used_days = used_days + v_days WHERE id = bal.id;
    ELSE
        INSERT INTO la_leave_balances (user_id, leave_type, year, entitled_days, used_days)
        VALUES (r.requester_id, r.leave_type, EXTRACT(YEAR FROM r.start_date)::int, v_days, v_days);
    END IF;

    v_coll := la_collate_hr_leave(r.id);

    PERFORM la_notify(r.requester_id, 'Leave approved',
        format('Congratulations! Your %s leave from %s to %s is fully approved.', r.leave_type, r.start_date, r.end_date));

    RETURN jsonb_build_object('success', true, 'status', 'APPROVED', 'message',
        'Approved. The leave is confirmed.' ||
        CASE WHEN (v_coll->>'success')::boolean THEN '' ELSE ' (HR portal sync: ' || COALESCE(v_coll->>'message','') || ')' END);
END; $$;

-- ---------------------------------------------------------------------------
-- 7. ENGINE — the caller's action queue (config-driven)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION la_workflow_action_queue()
RETURNS TABLE(
    request_id     UUID,
    requester_name TEXT,
    requester_dept TEXT,
    leave_type     TEXT,
    start_date     DATE,
    end_date       DATE,
    days           NUMERIC,
    status         TEXT,
    step_order     INTEGER,
    step_code      TEXT,
    step_name      TEXT,
    flow_code      TEXT,
    created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE u la_users%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT lr.id, req.full_name, req.department, lr.leave_type,
           lr.start_date, lr.end_date, lr.days, lr.status,
           rs.step_order, rs.code, rs.name, f.code, lr.created_at
    FROM la_request_steps rs
    JOIN la_leave_requests lr ON lr.id = rs.request_id
    JOIN la_users req        ON req.id = lr.requester_id
    JOIN wf_flows f          ON f.id = lr.flow_id
    JOIN wf_flow_steps fs    ON fs.flow_id = lr.flow_id AND fs.step_order = rs.step_order
    WHERE rs.status = 'PENDING' AND lr.current_step = rs.step_order
      AND (
            rs.resolved_actor_id = u.id
         OR EXISTS (
              SELECT 1 FROM wf_resolve_actors(lr.id, fs.rule, fs.actor_role_code, fs.rule_config) a
              WHERE a.id = u.id
         )
      )
    ORDER BY lr.created_at ASC;
END; $$;

-- ---------------------------------------------------------------------------
-- 8. READ — steps of a request (for a detail view), authorized to its actors
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION la_request_flow(p_request_id UUID)
RETURNS TABLE(
    step_order     INTEGER,
    code           TEXT,
    name           TEXT,
    actor_role_code TEXT,
    status         TEXT,
    resolved_actor TEXT,
    decided_by     TEXT,
    decided_at     TIMESTAMPTZ,
    note           TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u  la_users%ROWTYPE;
    r  la_leave_requests%ROWTYPE;
    mg UUID;
    v_ok BOOLEAN;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN; END IF;

    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN; END IF;

    SELECT manager_id INTO mg FROM la_users WHERE id = r.requester_id;

    SELECT (
        r.requester_id = u.id OR r.deputy_id = u.id OR mg = u.id
        OR u.role IN ('hr', 'ceo') OR u.email = la_ceo_email()
        OR EXISTS (SELECT 1 FROM la_request_steps s WHERE s.request_id = r.id AND s.resolved_actor_id = u.id)
    ) INTO v_ok;
    IF NOT v_ok THEN RETURN; END IF;

    RETURN QUERY
    SELECT rs.step_order, rs.code, rs.name, rs.actor_role_code, rs.status,
           ra.full_name, db.full_name, rs.decided_at, rs.note
    FROM la_request_steps rs
    LEFT JOIN la_users ra ON ra.id = rs.resolved_actor_id
    LEFT JOIN la_users db ON db.id = rs.decided_by
    WHERE rs.request_id = r.id
    ORDER BY rs.step_order;
END; $$;

-- ---------------------------------------------------------------------------
-- 9. RLS + GRANTS
-- ---------------------------------------------------------------------------
ALTER TABLE wf_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_user_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_flows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_flow_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE la_request_steps ENABLE ROW LEVEL SECURITY;
-- No policies: config/step tables are reachable only through SECURITY DEFINER RPCs.

REVOKE EXECUTE ON FUNCTION la_start_request(TEXT, DATE, DATE, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_step_decision(UUID, BOOLEAN, TEXT, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_workflow_action_queue() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_request_flow(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION la_start_request(TEXT, DATE, DATE, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION la_step_decision(UUID, BOOLEAN, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION la_workflow_action_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION la_request_flow(UUID) TO authenticated;
