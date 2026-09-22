-- ============================================================================
-- 031 — ENGINE HARDENING + ACTIVATION SWITCH
-- ----------------------------------------------------------------------------
--  1. Fix wf_step_applies(): a non-empty condition was making EVERY step skip.
--  2. Auto-skip a step when no eligible approver exists (excluding the
--     requester unless allow_self) instead of deadlocking the request.
--  3. Log engine decisions into la_approval_log (so request detail shows them).
--  4. wf_settings.engine_mode — the switch that makes the app use this engine.
--  5. Richer la_workflow_action_queue() for the mobile UI.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Condition evaluation — each present key is a filter; absent keys pass.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wf_step_applies(p_days NUMERIC, p_leave_type TEXT, p_condition JSONB)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
    SELECT (p_condition IS NULL OR p_condition = '{}'::jsonb)
        OR (
               (p_condition->>'min_days' IS NULL OR p_days >= (p_condition->>'min_days')::numeric)
           AND (p_condition->>'max_days' IS NULL OR p_days <= (p_condition->>'max_days')::numeric)
           AND (p_condition->>'leave_type' IS NULL OR p_condition->>'leave_type' = p_leave_type)
           );
$$;

-- ---------------------------------------------------------------------------
-- 4. Engine activation switch
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wf_settings (
    org_id      uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000',
    engine_mode TEXT NOT NULL DEFAULT 'legacy'
                CHECK (engine_mode IN ('legacy', 'configurable')),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
INSERT INTO wf_settings (org_id, engine_mode)
VALUES ('00000000-0000-0000-0000-000000000000', 'legacy')
ON CONFLICT (org_id) DO NOTHING;

ALTER TABLE wf_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_settings_read ON wf_settings;
CREATE POLICY wf_settings_read ON wf_settings FOR SELECT TO authenticated USING (true);
GRANT SELECT ON wf_settings TO authenticated;

CREATE OR REPLACE FUNCTION wf_engine_mode()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((SELECT engine_mode FROM wf_settings WHERE org_id = wf_default_org()), 'legacy');
$$;

-- la_approval_log.step was limited to the legacy step names; allow flow step codes.
ALTER TABLE la_approval_log DROP CONSTRAINT IF EXISTS la_approval_log_step_check;

-- ---------------------------------------------------------------------------
-- 2 + 3. Start a request: auto-skip un-actionable steps, record reasons.
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
    v_note TEXT;
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
        v_note   := NULL;

        IF NOT wf_step_applies(v_days, p_leave_type, st.condition) THEN
            v_status := 'SKIPPED';
            v_note   := 'Skipped: step condition not met';
        ELSIF st.step_type = 'init' OR (st.rule = 'requester' AND st.step_order = 0) THEN
            -- The employee's own submit step completes immediately.
            v_status := 'APPROVED';
            v_note   := 'Initiated';
        ELSE
            -- Eligible approvers exclude the requester unless the step allows self.
            SELECT a.id INTO v_actor
            FROM wf_resolve_actors(v_id, st.rule, st.actor_role_code, st.rule_config) a
            WHERE a.id <> u.id OR st.allow_self
            LIMIT 1;

            IF v_actor IS NULL THEN
                v_status := 'SKIPPED';
                v_note   := 'Skipped: no eligible approver';
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
            v_note
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
-- 3. Decide a step: also write to la_approval_log for the detail view.
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
    v_step  TEXT;
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
    v_step := COALESCE(fs.code, rs.code);

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
               rejection_step = v_step,
               history = r.history || jsonb_build_object(
                   'at', now(), 'actor', u.full_name, 'action', 'Rejected at ' || COALESCE(fs.name, fs.code), 'note', p_note)
         WHERE id = r.id;
        INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
        VALUES (r.id, v_step, u.id, 'Rejected', p_note);
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

    INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
    VALUES (r.id, v_step, u.id, 'Approved', p_note);

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
-- 5. Action queue — full row so the mobile UI needs no extra fetches.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS la_workflow_action_queue();

CREATE OR REPLACE FUNCTION la_workflow_action_queue()
RETURNS TABLE(
    request_id     UUID,
    requester_name TEXT,
    requester_pos  TEXT,
    requester_dept TEXT,
    leave_type     TEXT,
    start_date     DATE,
    end_date       DATE,
    days           NUMERIC,
    reason         TEXT,
    contact_during TEXT,
    deputy_name    TEXT,
    requester_manager TEXT,
    status         TEXT,
    step_order     INTEGER,
    step_code      TEXT,
    step_name      TEXT,
    flow_code      TEXT,
    is_final_step  BOOLEAN,
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
    SELECT lr.id, req.full_name, req.position, req.department, lr.leave_type,
           lr.start_date, lr.end_date, lr.days,
           lr.reason, lr.contact_during, dep.full_name, mgr.full_name, lr.status,
           rs.step_order, rs.code, rs.name, f.code,
           (rs.step_order = (SELECT max(s.step_order) FROM la_request_steps s
                              WHERE s.request_id = lr.id AND s.status <> 'SKIPPED')),
           lr.created_at
    FROM la_request_steps rs
    JOIN la_leave_requests lr ON lr.id = rs.request_id
    JOIN la_users req        ON req.id = lr.requester_id
    JOIN wf_flows f          ON f.id = lr.flow_id
    JOIN wf_flow_steps fs    ON fs.flow_id = lr.flow_id AND fs.step_order = rs.step_order
    LEFT JOIN la_users dep   ON dep.id = lr.deputy_id
    LEFT JOIN la_users mgr   ON mgr.id = req.manager_id
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

REVOKE EXECUTE ON FUNCTION la_workflow_action_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION la_workflow_action_queue() TO authenticated;

NOTIFY pgrst, 'reload schema';
