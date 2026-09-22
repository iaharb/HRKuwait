-- 041: Portal notification bridge for generic engine (docs/workflow_engine_design_v2.md §6.5, §11.4).
--
-- The generic engine (037) uses la_notify() which writes to la_notifications (FK → la_users).
-- The portal notification center reads from notifications (FK → employees).
-- This adds a helper to write to the portal's table and updates the engine to use it.

-- 1. Helper: insert a portal notification by user email (maps to employees table).
CREATE OR REPLACE FUNCTION wf_notify_portal_user(
    p_email TEXT,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_category TEXT DEFAULT NULL,
    p_link_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_emp_id UUID;
BEGIN
    -- Map by email (both la_users and employees share email as the identity key).
    SELECT id INTO v_emp_id FROM employees WHERE email = p_email LIMIT 1;
    IF v_emp_id IS NULL THEN RETURN; END IF;
    INSERT INTO notifications (user_id, title, message, type, category, link_id)
    VALUES (v_emp_id, p_title, p_message, p_type, p_category, p_link_id);
END; $$;

-- 2. Update wf_notify_request_actors to ALSO notify portal actors.
--    Original (037 line 267): only la_notify.
CREATE OR REPLACE FUNCTION wf_notify_request_actors(p_request_id UUID, p_title TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r      wf_requests%ROWTYPE;
    f      wf_flows%ROWTYPE;
    fs     wf_flow_steps%ROWTYPE;
    req    la_users%ROWTYPE;
    a      la_users%ROWTYPE;
BEGIN
    SELECT * INTO r FROM wf_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN; END IF;
    SELECT * INTO req FROM la_users WHERE id = r.requester_id;
    SELECT * INTO f FROM wf_flows WHERE id = r.flow_id;
    SELECT * INTO fs FROM wf_flow_steps
        WHERE flow_id = r.flow_id AND step_order = r.current_step;

    -- Original: notify actors via la_notify (leave app).
    FOR a IN
        SELECT * FROM wf_resolve_actors2(r.requester_id, r.deputy_id,
                 fs.rule, fs.actor_role_code, fs.rule_config)
    LOOP
        PERFORM la_notify(a.id, p_title,
            format('%s requests %s. Awaiting the "%s" step.',
                   req.full_name, r.request_type, COALESCE(fs.name, fs.code)));
        -- NEW: also notify portal notification center.
        PERFORM wf_notify_portal_user(a.email, p_title,
            format('%s requests %s. Awaiting the "%s" step.',
                   req.full_name, r.request_type, COALESCE(fs.name, fs.code)),
            'info', 'approval', r.id::text);
    END LOOP;
END; $$;

-- 3. Update wf_finalize_request to:
--    a) Add 'hajj' strategy: mark history, notify HR role holders.
--    b) Also notify portal for loan (FIN/FD) and requester.
--    c) Keep la_notify for leave app compatibility.
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
        -- Flag finance/HR (la_notify for leave app + portal notification).
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
        -- Hajj: mark history (no balance deduction), notify HR.
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

    -- Requester notification: both tables.
    PERFORM la_notify(r.requester_id, 'Request approved',
        format('Your %s request #%s is fully approved.', r.request_type, r.id));
    PERFORM wf_notify_portal_user(u.email, 'Request approved',
        format('Your %s request #%s is fully approved.', r.request_type, r.id),
        'success', 'request', r.id::text);

    RETURN jsonb_build_object('success', true, 'id', r.id, 'status', 'APPROVED',
        'message', 'Request approved and finalized.');
END; $$;

GRANT EXECUTE ON FUNCTION wf_notify_portal_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION wf_notify_request_actors(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION wf_finalize_request(UUID) TO authenticated, service_role;