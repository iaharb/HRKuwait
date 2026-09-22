-- ============================================================================
-- 030 — WORKFLOW CONFIG READ ACCESS (for the HR portal config page)
-- ----------------------------------------------------------------------------
-- The wf_* config tables from 029 are otherwise locked (RLS, no policies).
-- Let authenticated users READ the catalog so the config page can render it;
-- writes go through the service-role client used by the admin UI.
-- ============================================================================

DROP POLICY IF EXISTS wf_roles_read ON wf_roles;
CREATE POLICY wf_roles_read ON wf_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS wf_flows_read ON wf_flows;
CREATE POLICY wf_flows_read ON wf_flows FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS wf_flow_steps_read ON wf_flow_steps;
CREATE POLICY wf_flow_steps_read ON wf_flow_steps FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS wf_user_roles_read ON wf_user_roles;
CREATE POLICY wf_user_roles_read ON wf_user_roles FOR SELECT TO authenticated USING (true);

GRANT SELECT ON wf_roles, wf_flows, wf_flow_steps, wf_user_roles TO authenticated;

NOTIFY pgrst, 'reload schema';
