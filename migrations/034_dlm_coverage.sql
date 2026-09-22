-- 034: DLM coverage.
--
-- Returns the leave-app roster with each employee's direct line manager (DLM)
-- so the Workflow Config page can guarantee "every employee has a DLM except
-- the CEO". Reads la_users only; SECURITY DEFINER so HR (config page, service
-- role) can skip RLS.
--
CREATE OR REPLACE FUNCTION wf_dlm_coverage()
RETURNS TABLE(
    user_id       UUID,
    full_name     TEXT,
    email         TEXT,
    department    TEXT,
    "position"    TEXT,
    role          TEXT,
    status        TEXT,
    manager_id    UUID,
    manager_name  TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.full_name, u.email, u.department, u."position", u.role, u.status,
           u.manager_id, m.full_name
    FROM la_users u
    LEFT JOIN la_users m ON m.id = u.manager_id
    WHERE u.status = 'active'
    ORDER BY (u.role = 'ceo') DESC, u.department NULLS LAST, u.full_name;
END; $$;

REVOKE EXECUTE ON FUNCTION wf_dlm_coverage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wf_dlm_coverage() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';