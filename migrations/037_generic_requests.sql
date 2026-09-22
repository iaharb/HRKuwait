-- 037: Generic request engine (docs/workflow_engine_design_v2.md §4–§7, §8).
--
-- Adds the metadata-driven runtime on top of wf_request_types (036):
--   wf_requests        generic request header (payload, pinned flow/version)
--   wf_request_steps   step snapshots for generic requests
--   wf_loans           loan detail + generated instalment schedule
--   wf_start_request   validate payload -> eligibility -> flow -> steps
--   wf_step_decision   decision matrix (§6.3) + finalization strategies (§6.5)
--   wf_finalize_request balance/loan/none finalizers
--   wf_action_queue() / wf_request_flow()  generic read models
--
-- Engine plumbing consolidated here (resolver with entity rules, payload
-- condition evaluator, dual leave/request-type flow matching) so each migration
-- in the 036-039 range stays self-consistent when applied in order; §8 groups
-- some of this under 038 but nothing depends on a later file.
--
-- Scope note: the legacy leave engine (la_start_request / la_step_decision) is
-- intentionally UNTOUCHED so the running leave app and its tests keep exact
-- behavior. Generic requests never touch la_leave_requests in this migration;
-- switching the leave app to wf_start_request (with leave-detail materialization)
-- is a later UI-phase change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Flow matching accepts either leave types (legacy) or request types.
-- ---------------------------------------------------------------------------
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
      AND (applies_to = '{}'::jsonb
           OR applies_to->'leave_types'   ? p_leave_type
           OR applies_to->'request_types' ? p_leave_type)
    ORDER BY (applies_to->'leave_types' ? p_leave_type OR applies_to->'request_types' ? p_leave_type) DESC,
             version DESC, effective_from ASC, id
    LIMIT 1;
    RETURN f;
END; $$;

-- ---------------------------------------------------------------------------
-- 1. RUNTIME TABLES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wf_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    request_type  TEXT NOT NULL,
    requester_id  UUID NOT NULL REFERENCES la_users(id),
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    deputy_id     UUID REFERENCES la_users(id),
    flow_id       UUID,
    flow_version  INTEGER,
    detail_type   TEXT,
    detail_id     UUID,
    current_step  INTEGER,
    status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('DRAFT','PENDING','APPROVED','REJECTED','CANCELLED','RETURNED')),
    history       JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wf_requests_requester  ON wf_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_wf_requests_status     ON wf_requests(status);
CREATE INDEX IF NOT EXISTS idx_wf_requests_type       ON wf_requests(org_id, request_type);

CREATE TABLE IF NOT EXISTS wf_request_steps (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id        UUID NOT NULL REFERENCES wf_requests(id) ON DELETE CASCADE,
    flow_id           UUID,
    flow_version      INTEGER,
    step_order        INTEGER NOT NULL,
    code              TEXT,
    name              TEXT,
    actor_role_code   TEXT,
    rule              TEXT,
    rule_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
    step_type         TEXT NOT NULL DEFAULT 'approval',
    resolved_actor_id UUID REFERENCES la_users(id),
    status            TEXT NOT NULL DEFAULT 'WAITING'
                      CHECK (status IN ('WAITING','PENDING','APPROVED','REJECTED','SKIPPED','RETURNED')),
    decided_by        UUID REFERENCES la_users(id),
    decided_at        TIMESTAMPTZ,
    note              TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (request_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_wf_request_steps_req    ON wf_request_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_wf_request_steps_pending ON wf_request_steps(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_wf_request_steps_actor  ON wf_request_steps(resolved_actor_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS wf_loans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    request_id      UUID NOT NULL REFERENCES wf_requests(id) ON DELETE CASCADE,
    amount          NUMERIC NOT NULL,
    duration_months INTEGER NOT NULL,
    instalments     JSONB,
    status          TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','PAID','CANCELLED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (request_id)
);

-- ---------------------------------------------------------------------------
-- 2. ACTOR RESOLUTION (full rule catalog per §5) — entity rules read the
--    heads wired up by wf_org_context (035). This is the canonical resolver
--    for every engine path; the legacy wf_resolve_actors wrapper below keeps
--    its original signature so all existing callers keep working.
-- ---------------------------------------------------------------------------
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
BEGIN
    SELECT * INTO req FROM la_users WHERE id = p_requester_id;
    IF req.id IS NULL THEN RETURN; END IF;

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
        cur := req.manager_id;  -- fill remaining hops from the manager chain
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

-- Legacy signature kept as a thin wrapper over wf_resolve_actors2.
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
DECLARE r la_leave_requests%ROWTYPE;
BEGIN
    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN; END IF;
    RETURN QUERY SELECT * FROM wf_resolve_actors2(r.requester_id, r.deputy_id,
                                                  p_rule, p_role_code, p_rule_config);
END; $$;

-- ---------------------------------------------------------------------------
-- 3. CONDITION EVALUATOR for the attribute grammar (§6.1). AND across present
--    keys; unknown conditions are ignored (vacuous) so old steps keep working.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_step_applies_payload(
    p_request_type TEXT,
    p_requester_id UUID,
    p_payload      JSONB,
    p_condition    JSONB
)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
    SELECT (p_condition IS NULL OR p_condition = '{}'::jsonb)
       AND (NOT p_condition ? 'leave_types'
            OR p_condition->'leave_types' ? p_request_type)
       AND (NOT p_condition ? 'days_gt'  OR COALESCE((p_payload->>'days')::numeric, -1) >  (p_condition->>'days_gt')::numeric)
       AND (NOT p_condition ? 'days_gte' OR COALESCE((p_payload->>'days')::numeric, -1) >= (p_condition->>'days_gte')::numeric)
       AND (NOT p_condition ? 'days_lt'  OR COALESCE((p_payload->>'days')::numeric, -1) <  (p_condition->>'days_lt')::numeric)
       AND (NOT p_condition ? 'days_lte' OR COALESCE((p_payload->>'days')::numeric, -1) <= (p_condition->>'days_lte')::numeric)
       AND (NOT p_condition ? 'amount_gt'  OR COALESCE((p_payload->>'amount')::numeric, -1) >  (p_condition->>'amount_gt')::numeric)
       AND (NOT p_condition ? 'amount_gte' OR COALESCE((p_payload->>'amount')::numeric, -1) >= (p_condition->>'amount_gte')::numeric)
       AND (NOT p_condition ? 'amount_lt'  OR COALESCE((p_payload->>'amount')::numeric, -1) <  (p_condition->>'amount_lt')::numeric)
       AND (NOT p_condition ? 'amount_lte' OR COALESCE((p_payload->>'amount')::numeric, -1) <= (p_condition->>'amount_lte')::numeric)
       AND (NOT p_condition ? 'duration_months_gt'  OR COALESCE((p_payload->>'duration_months')::numeric, -1) >  (p_condition->>'duration_months_gt')::numeric)
       AND (NOT p_condition ? 'duration_months_gte' OR COALESCE((p_payload->>'duration_months')::numeric, -1) >= (p_condition->>'duration_months_gte')::numeric)
       AND (NOT p_condition ? 'duration_months_lt'  OR COALESCE((p_payload->>'duration_months')::numeric, -1) <  (p_condition->>'duration_months_lt')::numeric)
       AND (NOT p_condition ? 'duration_months_lte' OR COALESCE((p_payload->>'duration_months')::numeric, -1) <= (p_condition->>'duration_months_lte')::numeric)
       AND (NOT p_condition ? 'period' OR p_payload->>'period' = p_condition->>'period')
       AND (NOT p_condition ? 'min_days' OR COALESCE((p_payload->>'days')::numeric, -1) >= (p_condition->>'min_days')::numeric)
       AND (NOT p_condition ? 'max_days' OR COALESCE((p_payload->>'days')::numeric, -1) <= (p_condition->>'max_days')::numeric)
       AND (NOT p_condition ? 'leave_type' OR p_condition->>'leave_type' = p_request_type)
       AND (NOT p_condition ? 'requester_role' OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(p_condition->'requester_role') rr
            JOIN wf_user_roles ur ON ur.role_code = rr
            WHERE ur.user_id = p_requester_id
       ));
$$;

-- ---------------------------------------------------------------------------
-- 4. NOTIFY the eligible actors of the request's current step.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_notify_request_actors(p_request_id UUID, p_title TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r   wf_requests%ROWTYPE;
    fs  wf_flow_steps%ROWTYPE;
    req la_users%ROWTYPE;
    a   la_users%ROWTYPE;
BEGIN
    SELECT * INTO r FROM wf_requests WHERE id = p_request_id;
    IF r.id IS NULL OR r.current_step IS NULL THEN RETURN; END IF;

    SELECT * INTO fs FROM wf_flow_steps WHERE flow_id = r.flow_id AND step_order = r.current_step;
    SELECT * INTO req FROM la_users WHERE id = r.requester_id;

    FOR a IN SELECT * FROM wf_resolve_actors2(r.requester_id, r.deputy_id,
                                              fs.rule, fs.actor_role_code, fs.rule_config) LOOP
        PERFORM la_notify(a.id, p_title,
            format('%s requests %s. Awaiting the "%s" step.',
                   req.full_name, r.request_type, COALESCE(fs.name, fs.code)));
    END LOOP;
END; $$;

-- ---------------------------------------------------------------------------
-- 5. LOAN FINALIZATION — generate an equal-instalment schedule.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_loan_schedule(p_amount NUMERIC, p_months INTEGER)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_base     NUMERIC := floor(p_amount / p_months * 100) / 100;
    v_rest     NUMERIC := round(p_amount - v_base * p_months, 2);
    v_balance  NUMERIC := p_amount;
    v_schedule JSONB := '[]'::jsonb;
    v_start    DATE;
    v_principal NUMERIC;
    i INTEGER;
BEGIN
    v_start := date_trunc('month', CURRENT_DATE)::date;
    FOR i IN 1..p_months LOOP
        v_principal := v_base + CASE WHEN i = p_months THEN v_rest ELSE 0 END;
        v_balance := round(v_balance - v_principal, 2);
        v_schedule := v_schedule || jsonb_build_object(
            'n', i,
            'due', to_char(v_start + make_interval(months => i), 'YYYY-MM-DD'),
            'principal', v_principal,
            'balance', GREATEST(v_balance, 0)
        );
    END LOOP;
    RETURN v_schedule;
END; $$;

-- ---------------------------------------------------------------------------
-- 6. FINALIZE on the final approval step (§6.5).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_finalize_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r      wf_requests%ROWTYPE;
    rt     wf_request_types%ROWTYPE;
    u      la_users%ROWTYPE;
    strat  TEXT;
    v_days NUMERIC;
    v_year INTEGER;
    bal    la_leave_balances%ROWTYPE;
    v_coll JSONB;
    v_amount NUMERIC;
    v_months INTEGER;
    v_fin  la_users%ROWTYPE;
BEGIN
    SELECT * INTO r FROM wf_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Request not found.'); END IF;
    SELECT * INTO u FROM la_users WHERE id = r.requester_id;

    SELECT * INTO rt FROM wf_request_types
        WHERE org_id = wf_default_org() AND code = r.request_type;
    strat := COALESCE(rt.finalization->>'action', 'none');

    IF strat = 'balance' THEN
        v_days := COALESCE((r.payload->>'days')::numeric,
                   CASE WHEN r.payload ? 'start_date' AND r.payload ? 'end_date'
                        THEN la_count_working_days((r.payload->>'start_date')::date,
                                                   (r.payload->>'end_date')::date)
                        ELSE 0 END);
        v_year := EXTRACT(YEAR FROM CURRENT_DATE)::int;
        IF r.payload ? 'start_date' THEN
            v_year := EXTRACT(YEAR FROM (r.payload->>'start_date')::date)::int;
        END IF;
        SELECT * INTO bal FROM la_leave_balances
         WHERE user_id = r.requester_id AND leave_type = r.request_type AND year = v_year;
        IF bal.id IS NULL THEN
            INSERT INTO la_leave_balances (user_id, leave_type, year, entitled_days, used_days)
            VALUES (r.requester_id, r.request_type, v_year, v_days, v_days);
        ELSE
            UPDATE la_leave_balances SET used_days = used_days + v_days WHERE id = bal.id;
        END IF;
    ELSIF strat = 'loan' THEN
        v_amount  := COALESCE((r.payload->>'amount')::numeric, 0);
        v_months  := COALESCE((r.payload->>'duration_months')::int, 1);
        INSERT INTO wf_loans (org_id, request_id, amount, duration_months, instalments)
        VALUES (wf_default_org(), r.id, v_amount, v_months, wf_loan_schedule(v_amount, v_months));
        -- Flag finance/HR so the instalments get scheduled into payroll.
        FOR v_fin IN
            SELECT uu.* FROM la_users uu
            JOIN wf_user_roles ur ON ur.user_id = uu.id
            WHERE ur.role_code IN ('FIN','FD') AND uu.status = 'active'
        LOOP
            PERFORM la_notify(v_fin.id, 'Loan approved — finance action',
                format('%s approved employee loan #%s (%s %s over %s months).',
                       u.full_name, r.id, v_amount, COALESCE(rt.finalization->>'currency','SAR'), v_months));
        END LOOP;
    END IF;

    UPDATE wf_requests
       SET status = 'APPROVED', current_step = NULL,
           history = r.history || jsonb_build_object(
               'at', now(), 'actor', u.full_name, 'action', 'Finalized',
               'note', strat || ' strategy applied')
     WHERE id = r.id;

    PERFORM la_notify(r.requester_id, 'Request approved',
        format('Your %s request #%s is fully approved.', r.request_type, r.id));

    RETURN jsonb_build_object('success', true, 'id', r.id, 'status', 'APPROVED',
        'message', 'Request approved and finalized.');
END; $$;

-- ---------------------------------------------------------------------------
-- 7. ENGINE — start a generic request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_start_request(
    p_request_type TEXT,
    p_payload      JSONB,
    p_deputy_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u          la_users%ROWTYPE;
    rt         wf_request_types%ROWTYPE;
    f          wf_flows%ROWTYPE;
    st         wf_flow_steps%ROWTYPE;
    v_id       UUID := gen_random_uuid();
    v_actor    UUID;
    v_status   TEXT;
    v_note     TEXT;
    v_cur      INTEGER;
    v_payload  JSONB := p_payload;
    v_elig     RECORD;
    v_err      BOOLEAN;
    v_errors   JSONB;
    v_days     NUMERIC;
    v_sub      RECORD;
    v_coerce   RECORD;
    v_ok       BOOLEAN;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.');
    END IF;
    IF p_deputy_id IS NOT NULL AND p_deputy_id = u.id THEN
        RETURN jsonb_build_object('success', false, 'message', 'The replacement cannot be the requester.');
    END IF;

    SELECT * INTO rt FROM wf_request_types
        WHERE org_id = wf_default_org() AND code = p_request_type AND active;
    IF rt.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message',
            format('Unknown or inactive request type "%s".', p_request_type));
    END IF;

    -- Derived attribute: working days from dates when not supplied.
    IF not v_payload ? 'days'
       AND rt.payload_schema->'derived' ? 'days'
       AND v_payload ? 'start_date' AND v_payload ? 'end_date' THEN
        v_days := la_count_working_days((v_payload->>'start_date')::date,
                                        (v_payload->>'end_date')::date);
        v_payload := v_payload || jsonb_build_object('days', v_days);
    END IF;

    -- Validate the payload against the attribute schema.
    SELECT * INTO v_sub FROM wf_validate_payload(rt.payload_schema, v_payload);
    v_err := v_sub.ok; v_errors := v_sub.errors;
    IF NOT v_err THEN
        RETURN jsonb_build_object('success', false, 'message',
            'Payload failed validation.', 'errors', v_errors);
    END IF;

    -- Eligibility.
    SELECT * INTO v_elig FROM wf_check_eligibility(p_request_type, u.id, v_payload);
    IF NOT v_elig.eligible THEN
        RETURN jsonb_build_object('success', false, 'code', v_elig.code,
            'message', COALESCE(v_elig.reason, 'Not eligible for this request.'));
    END IF;

    f := wf_resolve_flow(p_request_type);
    IF f.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message',
            format('No active workflow covers "%s".', p_request_type));
    END IF;

    INSERT INTO wf_requests (id, org_id, request_type, requester_id, payload,
                             deputy_id, flow_id, flow_version, status, history)
    VALUES (v_id, wf_default_org(), p_request_type, u.id, v_payload,
            p_deputy_id, f.id, f.version, 'PENDING',
            jsonb_build_array(jsonb_build_object(
                'at', now(), 'actor', u.full_name, 'action', 'Submitted ' || p_request_type,
                'flow', f.code, 'version', f.version
            )));

    FOR st IN SELECT * FROM wf_flow_steps WHERE flow_id = f.id ORDER BY step_order LOOP
        v_actor  := NULL;
        v_status := 'WAITING';
        v_note   := NULL;

        IF NOT wf_step_applies_payload(p_request_type, u.id, v_payload, st.condition) THEN
            v_status := 'SKIPPED';
            v_note   := 'Skipped: step condition not met';
        ELSIF st.rule_config ? 'skip_for_requester_role' AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(st.rule_config->'skip_for_requester_role') = 'array'
                     THEN st.rule_config->'skip_for_requester_role' ELSE '[]'::jsonb END
            ) rr
            WHERE EXISTS (SELECT 1 FROM wf_user_roles ur
                          WHERE ur.user_id = u.id AND ur.role_code = rr)
        ) THEN
            v_status := 'SKIPPED';
            v_note   := 'Skipped: requester holds an exempt role for this step';
        ELSIF st.step_type = 'init' OR (st.rule = 'requester' AND st.step_order = 0) THEN
            v_status := 'APPROVED';
            v_note   := 'Initiated';
        ELSE
            SELECT a.id INTO v_actor
            FROM wf_resolve_actors2(u.id, p_deputy_id, st.rule, st.actor_role_code, st.rule_config) a
            WHERE a.id <> u.id OR st.allow_self
            LIMIT 1;

            IF v_actor IS NULL THEN
                v_status := 'SKIPPED';
                v_note   := 'Skipped: no eligible approver';
            END IF;
        END IF;

        INSERT INTO wf_request_steps (request_id, flow_id, flow_version, step_order, code,
                                      name, actor_role_code, rule, rule_config, step_type,
                                      resolved_actor_id, status, decided_by, decided_at, note)
        VALUES (v_id, f.id, f.version, st.step_order, st.code, st.name,
                st.actor_role_code, st.rule, st.rule_config, st.step_type,
                v_actor, v_status,
                CASE WHEN v_status = 'APPROVED' AND st.step_type = 'init' THEN u.id ELSE NULL END,
                CASE WHEN v_status = 'APPROVED' AND st.step_type = 'init' THEN now() ELSE NULL END,
                v_note);
    END LOOP;

    SELECT min(step_order) INTO v_cur FROM wf_request_steps
        WHERE request_id = v_id AND status = 'WAITING';

    IF v_cur IS NULL THEN
        -- Every step auto-completed/skipped — finalize immediately.
        PERFORM wf_finalize_request(v_id);
        RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'APPROVED',
            'message', 'Request approved — no approval steps required.');
    END IF;

    UPDATE wf_request_steps SET status = 'PENDING' WHERE request_id = v_id AND step_order = v_cur;
    UPDATE wf_requests SET current_step = v_cur WHERE id = v_id;
    PERFORM wf_notify_request_actors(v_id, 'Approval needed');

    PERFORM la_notify(u.id, 'Request submitted',
        format('Your %s request is now in the approval workflow.', p_request_type));

    RETURN jsonb_build_object('success', true, 'id', v_id, 'current_step', v_cur,
        'message', 'Request submitted.');
END; $$;

-- ---------------------------------------------------------------------------
-- 8. ENGINE — decide the current step (§6.3).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_step_decision(
    p_request_id UUID,
    p_decision   TEXT,
    p_note       TEXT DEFAULT NULL,
    p_extra      JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u          la_users%ROWTYPE;
    r          wf_requests%ROWTYPE;
    rs         wf_request_steps%ROWTYPE;
    fs         wf_flow_steps%ROWTYPE;
    v_ok       BOOLEAN;
    v_next     INTEGER;
    v_target   INTEGER;
    v_actor    UUID;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.');
    END IF;

    SELECT * INTO r FROM wf_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Request not found.');
    END IF;

    -- Cancel: only the requester, and only while pending.
    IF p_decision = 'cancel' THEN
        IF r.requester_id <> u.id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Only the requester can cancel.');
        END IF;
        UPDATE wf_requests SET status = 'CANCELLED', current_step = NULL,
               history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name,
                   'action', 'Cancelled request', 'note', p_note)
         WHERE id = r.id;
        PERFORM la_notify(r.requester_id, 'Request cancelled', 'Your request was cancelled.');
        RETURN jsonb_build_object('success', true, 'message', 'Request cancelled.');
    END IF;

    SELECT * INTO rs FROM wf_request_steps
     WHERE request_id = p_request_id AND step_order = r.current_step AND status = 'PENDING';
    IF rs.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This request is not awaiting an action.');
    END IF;

    SELECT * INTO fs FROM wf_flow_steps WHERE flow_id = r.flow_id AND step_order = rs.step_order;

    SELECT EXISTS (
        SELECT 1 FROM wf_resolve_actors2(r.requester_id, r.deputy_id,
                                         fs.rule, fs.actor_role_code, fs.rule_config) a
        WHERE a.id = u.id
    ) INTO v_ok;
    IF NOT v_ok AND NOT (fs.allow_self AND u.id = r.requester_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'You are not eligible to act on this step.');
    END IF;

    -- Reject terminates the flow.
    IF p_decision = 'reject' THEN
        UPDATE wf_request_steps
           SET status = 'REJECTED', decided_by = u.id, decided_at = now(), note = p_note
         WHERE id = rs.id;
        UPDATE wf_requests
           SET status = 'REJECTED', current_step = NULL,
               history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name,
                   'action', 'Rejected at ' || COALESCE(fs.name, fs.code), 'note', p_note)
         WHERE id = r.id;
        PERFORM la_notify(r.requester_id, 'Request rejected',
            format('Your %s request was rejected at the "%s" step because: %s',
                   r.request_type, COALESCE(fs.name, fs.code), COALESCE(p_note, 'no reason given')));
        RETURN jsonb_build_object('success', true, 'message', 'Rejected. The requester has been notified.');
    END IF;

    -- Return for correction: bounce the flow to the requester's own step.
    IF p_decision = 'return' THEN
        SELECT min(step_order) INTO v_target FROM wf_request_steps
         WHERE request_id = r.id AND rule = 'requester';
        IF v_target IS NULL THEN v_target := 0; END IF;
        IF fs.rule_config ? 'step_target' THEN
            v_target := (fs.rule_config->>'step_target')::int;
        END IF;

        UPDATE wf_request_steps
           SET status = CASE WHEN status = 'SKIPPED' THEN 'SKIPPED'
                             WHEN step_order = v_target THEN 'PENDING'
                             ELSE 'WAITING' END,
               decided_by = NULL, decided_at = NULL, note = NULL
         WHERE request_id = r.id AND step_order >= v_target;
        UPDATE wf_requests
           SET status = 'RETURNED', current_step = v_target,
               history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name,
                   'action', 'Returned for correction at ' || COALESCE(fs.name, fs.code),
                   'note', p_note)
         WHERE id = r.id;
        RETURN jsonb_build_object('success', true, 'current_step', v_target,
            'message', 'Returned to the requester for correction.');
    END IF;

    -- approve / endorse (endorse records an opinion in the note).
    UPDATE wf_request_steps
       SET status = 'APPROVED', decided_by = u.id, decided_at = now(),
           note = CASE WHEN p_decision = 'endorse'
                       THEN COALESCE('Endorsed: ' || p_note, 'Endorsed')
                       ELSE p_note END
     WHERE id = rs.id;

    UPDATE wf_requests
       SET history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name,
               'action', 'Approved at ' || COALESCE(fs.name, fs.code), 'note', p_note)
     WHERE id = r.id;

    SELECT min(step_order) INTO v_next FROM wf_request_steps
        WHERE request_id = r.id AND step_order > rs.step_order AND status = 'WAITING';

    IF v_next IS NOT NULL THEN
        UPDATE wf_request_steps SET status = 'PENDING' WHERE request_id = r.id AND step_order = v_next;
        UPDATE wf_requests SET current_step = v_next WHERE id = r.id;
        PERFORM wf_notify_request_actors(r.id, 'Approval needed');
        RETURN jsonb_build_object('success', true, 'current_step', v_next,
            'message', 'Approved. Forwarded to the next step.');
    END IF;

    -- Final approval.
    RETURN wf_finalize_request(r.id);
END; $$;

-- ---------------------------------------------------------------------------
-- 9. READ MODELS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_action_queue()
RETURNS TABLE(
    request_id      UUID,
    requester_name  TEXT,
    requester_dept  TEXT,
    request_type    TEXT,
    status          TEXT,
    step_order      INTEGER,
    step_code       TEXT,
    step_name       TEXT,
    flow_code       TEXT,
    created_at      TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE u la_users%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT r.id, req.full_name, req.department, r.request_type, r.status,
           rs.step_order, rs.code, rs.name, f.code, r.created_at
    FROM wf_request_steps rs
    JOIN wf_requests r      ON r.id = rs.request_id
    JOIN la_users req       ON req.id = r.requester_id
    JOIN wf_flows f         ON f.id = r.flow_id
    JOIN wf_flow_steps fs   ON fs.flow_id = r.flow_id AND fs.step_order = rs.step_order
    WHERE rs.status = 'PENDING' AND r.current_step = rs.step_order AND r.status = 'PENDING'
      AND (rs.resolved_actor_id = u.id
           OR EXISTS (SELECT 1 FROM wf_resolve_actors2(r.requester_id, r.deputy_id,
                        fs.rule, fs.actor_role_code, fs.rule_config) a WHERE a.id = u.id))
    ORDER BY r.created_at ASC;
END; $$;

CREATE OR REPLACE FUNCTION wf_request_flow(p_request_id UUID)
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
    u     la_users%ROWTYPE;
    r     wf_requests%ROWTYPE;
    v_ok  BOOLEAN;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN; END IF;

    SELECT * INTO r FROM wf_requests x WHERE x.id = p_request_id;
    IF r.id IS NULL THEN RETURN; END IF;

    SELECT (
        r.requester_id = u.id OR r.deputy_id = u.id
        OR u.role IN ('hr', 'ceo') OR u.email = la_ceo_email()
        OR EXISTS (SELECT 1 FROM wf_request_steps s
                   WHERE s.request_id = r.id AND s.resolved_actor_id = u.id)
    ) INTO v_ok;
    IF v_ok IS DISTINCT FROM TRUE THEN RETURN; END IF;

    RETURN QUERY
    SELECT rs.step_order, rs.code, rs.name, rs.actor_role_code, rs.status,
           ra.full_name, db.full_name, rs.decided_at, rs.note
    FROM wf_request_steps rs
    LEFT JOIN la_users ra ON ra.id = rs.resolved_actor_id
    LEFT JOIN la_users db ON db.id = rs.decided_by
    WHERE rs.request_id = r.id
    ORDER BY rs.step_order;
END; $$;

-- ---------------------------------------------------------------------------
-- 10. RLS + GRANTS
-- ---------------------------------------------------------------------------
ALTER TABLE wf_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_request_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_loans         ENABLE ROW LEVEL SECURITY;
-- No client policies: runtime tables are reachable only through the RPC surface.

REVOKE EXECUTE ON FUNCTION wf_resolve_actors2(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_step_applies_payload(TEXT, UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_notify_request_actors(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_loan_schedule(NUMERIC, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_finalize_request(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_start_request(TEXT, JSONB, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_step_decision(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_action_queue() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_request_flow(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION wf_start_request(TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION wf_step_decision(UUID, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION wf_action_queue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION wf_request_flow(UUID) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON wf_requests, wf_request_steps, wf_loans TO authenticated, service_role;
-- Service role needs to create/edit flows (the admin config UI writes via the
-- service-role client); read-only policies for authenticated were already set in 030.
GRANT SELECT, INSERT, UPDATE, DELETE ON wf_flows, wf_flow_steps TO service_role;

NOTIFY pgrst, 'reload schema';