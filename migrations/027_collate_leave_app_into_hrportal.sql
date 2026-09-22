-- ============================================================================
-- LEAVE APP — COLLATE FINALIZED REQUESTS INTO HR PORTAL
-- ----------------------------------------------------------------------------
-- After the CEO final-approves a leave-app request, mirror it into the HR
-- portal's `leave_requests` table with status 'HR_Finalized'. That:
--   1. shows the request in the HR portal LeaveManagement history, and
--   2. fires the existing update_leave_balances() trigger (migration 003),
--      which recomputes the employee's REAL balance from leave_requests.
--
-- `la_request_id` records the origin so re-collations stay idempotent.
-- ============================================================================

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS la_request_id UUID;

-- Collate one leave-app request into the HR portal (idempotent).
CREATE OR REPLACE FUNCTION la_collate_hr_leave(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    lr  la_leave_requests%ROWTYPE;
    lu  la_users%ROWTYPE;
    emp employees%ROWTYPE;
    v_id UUID := gen_random_uuid();
    v_days NUMERIC;
BEGIN
    SELECT * INTO lr FROM la_leave_requests WHERE id = p_request_id;
    IF lr.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Leave-app request not found.'); END IF;

    SELECT * INTO lu FROM la_users WHERE id = lr.requester_id;
    IF lu.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Requester not found.'); END IF;

    -- Map to the HR portal employee by email (employees.email mirrors auth email).
    SELECT * INTO emp FROM employees WHERE lower(NULLIF(email,'')) = lower(lu.email);
    IF emp.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Employee not found in HR portal.'); END IF;

    -- Idempotent: remove a previous collation of this same request first.
    DELETE FROM leave_requests WHERE la_request_id = lr.id;

    -- HR portal stores ShortPermission in hours and other types in days.
    IF lr.leave_type = 'ShortPermission' THEN
        v_days := 0;
    ELSE
        v_days := lr.days;
    END IF;

    INSERT INTO leave_requests (
        id, employee_id, employee_name, department, type, start_date, end_date, days,
        reason, status, manager_id, created_at, history, duration_hours, la_request_id
    ) VALUES (
        v_id, emp.id, emp.name, emp.department, lr.leave_type, lr.start_date, lr.end_date, v_days,
        lr.reason, 'HR_Finalized',
        COALESCE(emp.manager_name, ''),
        lr.created_at,
        jsonb_build_array(jsonb_build_object(
            'at', now(), 'actor', 'Leave App', 'action', 'CEO final approval', 'note', 'Collated from Leave App'
        )),
        CASE WHEN lr.leave_type = 'ShortPermission' THEN lr.days * 8 ELSE NULL END,
        lr.id
    );

    RETURN jsonb_build_object('success', true, 'message', 'Request collated into HR portal leave record.');
END;
$$;

-- ============================================================================
-- 4.5 CEO final decision  (recreated to include the HR-portal collation)
-- ============================================================================
CREATE OR REPLACE FUNCTION la_ceo_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u  la_users%ROWTYPE;
    r  la_leave_requests%ROWTYPE;
    bal la_leave_balances%ROWTYPE;
    v_collate JSONB;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;
    IF u.email <> la_ceo_email() THEN RETURN jsonb_build_object('success', false, 'message', 'CEO access required.'); END IF;

    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Request not found.'); END IF;
    IF r.status <> 'HR_APPROVED' THEN RETURN jsonb_build_object('success', false, 'message', 'This request is not at the CEO step.'); END IF;

    IF NOT p_approve THEN
        UPDATE la_leave_requests
           SET status = 'REJECTED', rejection_reason = p_note, rejection_step = 'ceo',
               history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                        'action', 'CEO rejected', 'note', p_note)
         WHERE id = r.id;
        INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
        VALUES (r.id, 'ceo', u.id, 'Rejected', p_note);
        PERFORM la_notify(r.requester_id, 'Leave rejected by CEO',
            format('The CEO rejected your %s request because: %s', r.leave_type, COALESCE(p_note, 'no reason given')));
        RETURN jsonb_build_object('success', true, 'message', 'Rejected. The employee has been notified.');
    END IF;

    UPDATE la_leave_requests
       SET status = 'APPROVED', rejection_reason = NULL, rejection_step = NULL,
           history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                    'action', 'CEO approved — final', 'note', p_note)
     WHERE id = r.id;
    INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
    VALUES (r.id, 'ceo', u.id, 'Approved', p_note);

    -- Deduct balance now that the request is final.
    SELECT * INTO bal FROM la_leave_balances
     WHERE user_id = r.requester_id AND leave_type = r.leave_type
       AND year = EXTRACT(YEAR FROM r.start_date)::int;

    IF bal.id IS NOT NULL THEN
        UPDATE la_leave_balances SET used_days = used_days + r.days WHERE id = bal.id;
    ELSE
        INSERT INTO la_leave_balances (user_id, leave_type, year, entitled_days, used_days)
        VALUES (r.requester_id, r.leave_type, EXTRACT(YEAR FROM r.start_date)::int, r.days, r.days);
    END IF;

    -- Collate into the HR portal leave record (shows in LeaveManagement + recalcs balance).
    v_collate := la_collate_hr_leave(r.id);

    PERFORM la_notify(r.requester_id, 'Leave approved',
        format('Congratulations! Your %s leave from %s to %s has been fully approved.',
               r.leave_type, r.start_date, r.end_date));

    RETURN jsonb_build_object('success', true, 'message',
        'Approved. The leave is confirmed.' ||
        CASE WHEN (v_collate->>'success')::boolean THEN '' ELSE ' (HR portal sync: ' || COALESCE(v_collate->>'message','') || ')' END);
END;
$$;