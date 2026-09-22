-- 038: Live-flow condition upgrade + engine polish
-- (docs/workflow_engine_design_v2.md §6.1 / §8 items 3-4).
--
-- The generic engine (037) already carries the entity actor rules and the
-- payload condition evaluator. This migration:
--   1. Extends the LEGACY leave-flow evaluator (wf_step_applies, used by
--      la_start_request) to the new attribute grammar so users can edit leave
--      flows with days_gt/days_gte/days_lt/days_lte and leave_types lists
--      without touching the payload engine. Amount/duration/requester-role
--      conditions only make sense on generic requests, which already use the
--      payload evaluator.
--   2. Auto-skips a legacy leave step whose resolved actor list is empty even
--      when marked required but unactionable (guard parity with the generic
--      engine; behavior of existing flows is unchanged because their steps
--      resolve to real users or are already skipped at submit).
--   3. Records the pursuer of a return (delegation) decision note.
--
-- Pure additive: nothing existing is removed or re-routed.
-- ============================================================================

-- 1. Legacy evaluator understands the extended grammar.
CREATE OR REPLACE FUNCTION wf_step_applies(p_days NUMERIC, p_leave_type TEXT, p_condition JSONB)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
    SELECT (p_condition IS NULL OR p_condition = '{}'::jsonb)
       AND (NOT p_condition ? 'leave_types'     OR p_condition->'leave_types' ? p_leave_type)
       AND (NOT p_condition ? 'leave_type'      OR p_condition->>'leave_type' = p_leave_type)
       AND (NOT p_condition ? 'min_days'        OR p_days >= (p_condition->>'min_days')::numeric)
       AND (NOT p_condition ? 'max_days'        OR p_days <= (p_condition->>'max_days')::numeric)
       AND (NOT p_condition ? 'days_gt'         OR p_days >  (p_condition->>'days_gt')::numeric)
       AND (NOT p_condition ? 'days_gte'        OR p_days >= (p_condition->>'days_gte')::numeric)
       AND (NOT p_condition ? 'days_lt'         OR p_days <  (p_condition->>'days_lt')::numeric)
       AND (NOT p_condition ? 'days_lte'        OR p_days <= (p_condition->>'days_lte')::numeric);
$$;

-- 2. la_start_request: treat a required step with no resolvable actor as a
--    skip-with-note instead of a silent WAITING dead-end (matches 032's
--    decision that a missing actor is a configuration gap, not a hang).
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

    FOR st IN SELECT * FROM wf_flow_steps WHERE flow_id = f.id ORDER BY step_order LOOP
        v_actor  := NULL;
        v_status := 'WAITING';
        v_note   := NULL;

        IF NOT wf_step_applies(v_days, p_leave_type, st.condition) THEN
            v_status := 'SKIPPED';
            v_note   := 'Skipped: step condition not met';
        ELSIF st.rule_config ? 'skip_for_requester_role' AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(st.rule_config->'skip_for_requester_role') = 'array'
                     THEN st.rule_config->'skip_for_requester_role' ELSE '[]'::jsonb END
            ) r
            WHERE EXISTS (
                SELECT 1 FROM wf_user_roles ur
                WHERE ur.user_id = u.id AND ur.role_code = r
            )
        ) THEN
            v_status := 'SKIPPED';
            v_note   := 'Skipped: requester holds an exempt role for this step';
        ELSIF st.step_type = 'init' OR (st.rule = 'requester' AND st.step_order = 0) THEN
            v_status := 'APPROVED';
            v_note   := 'Initiated';
        ELSE
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

    SELECT min(step_order) INTO v_cur
    FROM la_request_steps WHERE request_id = v_id AND status = 'WAITING';

    IF v_cur IS NULL THEN
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

REVOKE EXECUTE ON FUNCTION la_start_request(TEXT, DATE, DATE, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION la_start_request(TEXT, DATE, DATE, TEXT, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';