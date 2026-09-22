-- 040: Codify the live wf_action_queue RETURNED fix (docs/workflow_engine_design_v2.md §6.3, §14.2-2).
--
-- The original 037 wf_action_queue only surfaced steps on requests with
-- r.status = 'PENDING'. A step returned to the requester for correction has
-- r.status = 'RETURNED' (current_step reset to the requester's init step), so it
-- never appeared in any queue and the requester had no resubmit affordance.
--
-- This recreates the function exactly as applied live in the SQL Editor (verified
-- by generic_ui_verify.cjs — 32/32 PASS). Idempotent; re-runnable.
--
--   rs.status filter:  PENDING | RETURNED  (the step awaiting action; RETURNED only
--                      applies to the requester's init step after a return)
--   r.status filter:   PENDING | RETURNED  (in-flight or returned-for-correction)
--   authorization:     unchanged (resolved actor or wf_resolve_actors2 membership)

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
    WHERE rs.status IN ('PENDING', 'RETURNED')
      AND r.current_step = rs.step_order
      AND r.status IN ('PENDING', 'RETURNED')
      AND (rs.resolved_actor_id = u.id
           OR EXISTS (SELECT 1 FROM wf_resolve_actors2(r.requester_id, r.deputy_id,
                         fs.rule, fs.actor_role_code, fs.rule_config) a WHERE a.id = u.id))
    ORDER BY r.created_at ASC;
END; $$;

GRANT EXECUTE ON FUNCTION wf_action_queue() TO authenticated, service_role;