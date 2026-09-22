-- 044: Leave app → generic engine switch (docs/workflow_engine_design_v2.md §13.2, §14.2-1).
--
-- 1. Creates a leave-specific flow (DEPUTY → MANAGER → HR → CEO) in the generic engine.
-- 2. Extends wf_finalize_request to materialize leave into BOTH:
--    - la_leave_requests (leave-app legacy table)
--    - leave_requests (portal/mobile table)
-- 3. Creates adapter RPCs for the legacy leave-app RPCs:
--    la_submit_leave_request → wf_start_request (leave flow)
--    la_deputy_decision     → wf_step_decision ('approve'/'reject')
--    la_manager_decision    → wf_step_decision ('approve'/'reject')
--    la_hr_decision         → wf_step_decision ('approve'/'reject' with final_days)
--    la_ceo_decision        → wf_step_decision ('approve'/'reject')
--    la_action_queue        → wf_action_queue (already compatible via wf_request_steps)
--
-- After this, the leave-app can switch to the generic engine. The portal/mobile
-- already use leave_requests directly; their balance trigger remains unchanged.

-- 1. Ensure the leave flow exists (idempotent upsert).
DO $$
DECLARE
    v_flow_id UUID;
    v_org_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
    -- Upsert the leave flow
    INSERT INTO wf_flows (org_id, code, name, version, status, applies_to, effective_from)
    VALUES (v_org_id, 'LEAVE', 'Leave Approval', 1, 'active',
            '{"request_types":["Annual","Sick","Emergency","ShortPermission","Hajj"]}'::jsonb,
            CURRENT_DATE)
    ON CONFLICT (org_id, code, version) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        applies_to = EXCLUDED.applies_to
    RETURNING id INTO v_flow_id;

    -- If upsert didn't return (conflict on existing), select it
    IF v_flow_id IS NULL THEN
        SELECT id INTO v_flow_id FROM wf_flows WHERE org_id = v_org_id AND code = 'LEAVE' AND status = 'active' LIMIT 1;
    END IF;

    -- Upsert flow steps (delete existing for this flow first)
    DELETE FROM wf_flow_steps WHERE flow_id = v_flow_id;

    -- Step 0: Init (requester)
    INSERT INTO wf_flow_steps (flow_id, step_order, code, name, actor_role_code, step_type, rule, is_required, allow_self)
    VALUES (v_flow_id, 0, 'INIT', 'Initiate', 'EMP', 'init', 'requester', true, true);

    -- Step 1: Deputy (replacement) - optional, uses requester_replacement rule
    INSERT INTO wf_flow_steps (flow_id, step_order, code, name, actor_role_code, step_type, rule, rule_config, is_required, allow_self)
    VALUES (v_flow_id, 1, 'DEPUTY', 'Replacement', NULL, 'acknowledge', 'requester_replacement', '{}', false, false);

    -- Step 2: Manager (direct line manager)
    INSERT INTO wf_flow_steps (flow_id, step_order, code, name, actor_role_code, step_type, rule, rule_config, is_required, allow_self)
    VALUES (v_flow_id, 2, 'MANAGER', 'Line Manager', NULL, 'approval', 'line_manager', '{"level":1}', true, false);

    -- Step 3: HR (balance check)
    INSERT INTO wf_flow_steps (flow_id, step_order, code, name, actor_role_code, step_type, rule, rule_config, is_required, allow_self)
    VALUES (v_flow_id, 3, 'HR', 'HR Manager', 'HRM', 'approval', 'role', '{}', true, false);

    -- Step 4: CEO (final)
    INSERT INTO wf_flow_steps (flow_id, step_order, code, name, actor_role_code, step_type, rule, rule_config, is_required, allow_self)
    VALUES (v_flow_id, 4, 'CEO', 'CEO', 'CEO', 'approval', 'role', '{}', true, false);

END $$;

-- 2. Update wf_finalize_request to materialize leave into la_leave_requests AND leave_requests
--    (extends the existing function from migration 037/041)
DROP FUNCTION IF EXISTS wf_finalize_request(UUID);

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
    v_amount NUMERIC;
    v_months INTEGER;
    v_fin  la_users%ROWTYPE;
    v_hr   la_users%ROWTYPE;
    v_leave_type TEXT;
    v_start_date DATE;
    v_end_date DATE;
    v_reason TEXT;
    v_manager_id UUID;
    v_legacy_id UUID;
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

        -- NEW: Materialize into la_leave_requests (leave-app legacy)
        v_leave_type := r.request_type;
        v_start_date := (r.payload->>'start_date')::date;
        v_end_date   := (r.payload->>'end_date')::date;
        v_reason     := r.payload->>'reason';
        SELECT manager_id INTO v_manager_id FROM la_users WHERE id = r.requester_id;

        INSERT INTO la_leave_requests (
            requester_id, leave_type, start_date, end_date, days,
            reason, contact, deputy_id, status, manager_id,
            flow_id, flow_version, current_step, history, created_at, updated_at
        ) VALUES (
            r.requester_id, v_leave_type, v_start_date, v_end_date, v_days::int,
            v_reason, NULL, r.deputy_id, 'HR_Finalized', v_manager_id,
            r.flow_id, r.flow_version, NULL,
            r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'action', 'Finalized', 'note', 'Leave balance deducted'),
            now(), now()
        ) RETURNING id INTO v_legacy_id;

        -- NEW: Materialize into leave_requests (portal/mobile)
        INSERT INTO leave_requests (
            employee_id, employee_name, department, type, start_date, end_date, days,
            duration_hours, reason, status, manager_id, history, created_at, updated_at
        ) VALUES (
            r.requester_id, u.full_name, u.department, v_leave_type, v_start_date, v_end_date, v_days::int,
            NULL, v_reason, 'HR_Finalized', v_manager_id,
            r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'action', 'Finalized', 'note', 'Leave balance deducted'),
            now(), now()
        );

    ELSIF strat = 'loan' THEN
        v_amount  := COALESCE((r.payload->>'amount')::numeric, 0);
        v_months  := COALESCE((r.payload->>'duration_months')::int, 1);
        INSERT INTO wf_loans (org_id, request_id, amount, duration_months, instalments)
        VALUES (wf_default_org(), r.id, v_amount, v_months, wf_loan_schedule(v_amount, v_months));
        FOR v_fin IN
            SELECT uu.* FROM la_users uu
            JOIN wf_user_roles ur ON ur.user_id = uu.id
            WHERE ur.role_code IN ('FIN','FD') AND uu.status = 'active'
        LOOP
            PERFORM la_notify(v_fin.id, 'Loan approved — finance action',
                format('%s approved employee loan #%s (%s %s over %s months).',
                       u.full_name, r.id, v_amount, COALESCE(rt.finalization->>'currency','SAR'), v_months));
            PERFORM wf_notify_portal_user(v_fin.email, 'Loan approved — finance action',
                format('%s approved employee loan #%s (%s %s over %s months).',
                       u.full_name, r.id, v_amount, COALESCE(rt.finalization->>'currency','SAR'), v_months),
                'urgent', 'finance', r.id::text);
        END LOOP;
    ELSIF strat = 'hajj' OR r.request_type = 'Hajj' THEN
        FOR v_hr IN
            SELECT uu.* FROM la_users uu
            JOIN wf_user_roles ur ON ur.user_id = uu.id
            WHERE ur.role_code = 'HRM' AND uu.status = 'active'
        LOOP
            PERFORM la_notify(v_hr.id, 'Hajj leave approved',
                format('%s Hajj leave request #%s fully approved.', u.full_name, r.id));
            PERFORM wf_notify_portal_user(v_hr.email, 'Hajj leave approved',
                format('%s Hajj leave request #%s fully approved.', u.full_name, r.id),
                'info', 'hajj', r.id::text);
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
    PERFORM wf_notify_portal_user(u.email, 'Request approved',
        format('Your %s request #%s is fully approved.', r.request_type, r.id),
        'success', 'request', r.id::text);

    RETURN jsonb_build_object('success', true, 'id', r.id, 'status', 'APPROVED',
        'message', 'Request approved and finalized.');
END; $$;

-- 3. Adapter RPCs for legacy leave-app (map to generic engine)
--    These keep the same signatures so the leave-app code doesn't change.

-- 3.1 la_submit_leave_request → wf_start_request
CREATE OR REPLACE FUNCTION la_submit_leave_request(
    p_leave_type   TEXT,
    p_start_date   DATE,
    p_end_date     DATE,
    p_reason       TEXT,
    p_contact      TEXT,
    p_deputy_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payload JSONB;
    v_res JSONB;
BEGIN
    v_payload := jsonb_build_object(
        'start_date', p_start_date,
        'end_date',   p_end_date,
        'reason',     p_reason,
        'contact_during', p_contact
    );
    -- Use the generic engine's start request with the ACTUAL leave type (e.g., "Annual")
    -- The flow resolver will pick the LEAVE flow based on applies_to
    v_res := wf_start_request(p_leave_type, v_payload, p_deputy_id);
    RETURN v_res;
END; $$;

-- 3.2 la_deputy_decision → wf_step_decision
CREATE OR REPLACE FUNCTION la_deputy_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN wf_step_decision(p_request_id, CASE WHEN p_approve THEN 'approve' ELSE 'reject' END, p_note, NULL);
END; $$;

-- 3.3 la_manager_decision → wf_step_decision
CREATE OR REPLACE FUNCTION la_manager_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN wf_step_decision(p_request_id, CASE WHEN p_approve THEN 'approve' ELSE 'reject' END, p_note, NULL);
END; $$;

-- 3.4 la_hr_decision → wf_step_decision (with final_days for balance)
CREATE OR REPLACE FUNCTION la_hr_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL,
    p_final_days NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN wf_step_decision(p_request_id, CASE WHEN p_approve THEN 'approve' ELSE 'reject' END, p_note, 
                            jsonb_build_object('final_days', p_final_days)::jsonb);
END; $$;

-- 3.5 la_ceo_decision → wf_step_decision
CREATE OR REPLACE FUNCTION la_ceo_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN wf_step_decision(p_request_id, CASE WHEN p_approve THEN 'approve' ELSE 'reject' END, p_note, NULL);
END; $$;

-- 3.6 la_action_queue → wf_action_queue (already compatible, just grant)
GRANT EXECUTE ON FUNCTION la_action_queue() TO authenticated, service_role;

-- Grant all adapters
GRANT EXECUTE ON FUNCTION la_submit_leave_request(TEXT, DATE, DATE, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION la_deputy_decision(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION la_manager_decision(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION la_hr_decision(UUID, BOOLEAN, TEXT, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION la_ceo_decision(UUID, BOOLEAN, TEXT) TO authenticated, service_role;