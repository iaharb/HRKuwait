-- 046: Organization Structure Consolidation (Phase 4 - Cleanup)
-- docs/org_structure_consolidation_plan.md Phase 4

-- 1. Add audit trail table for org structure changes
CREATE TABLE IF NOT EXISTS org_structure_audit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    actor_user_id   UUID REFERENCES la_users(id),
    action          TEXT NOT NULL,  -- 'create' | 'update' | 'delete' | 'reassign' | 'head_change' | 'dlm_change'
    entity_type     TEXT NOT NULL,  -- 'org_unit' | 'job_title' | 'employee_assignment' | 'user_role' | 'head' | 'dlm'
    entity_id       UUID NOT NULL,
    old_values      JSONB,
    new_values      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_structure_audit_entity ON org_structure_audit(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_org_structure_audit_actor ON org_structure_audit(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_org_structure_audit_created ON org_structure_audit(created_at);

-- 2. Audit trigger for hr_org_units
CREATE OR REPLACE FUNCTION org_structure_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO org_structure_audit (org_id, actor_user_id, action, entity_type, entity_id, new_values)
        VALUES (NEW.org_id, (SELECT id FROM la_users WHERE email = (auth.jwt() ->> 'email') LIMIT 1),
                'create', 'org_unit', NEW.id, to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO org_structure_audit (org_id, actor_user_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (NEW.org_id, (SELECT id FROM la_users WHERE email = (auth.jwt() ->> 'email') LIMIT 1),
                'update', 'org_unit', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO org_structure_audit (org_id, actor_user_id, action, entity_type, entity_id, old_values)
        VALUES (OLD.org_id, (SELECT id FROM la_users WHERE email = (auth.jwt() ->> 'email') LIMIT 1),
                'delete', 'org_unit', OLD.id, to_jsonb(OLD));
    END IF;
    RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_org_structure_audit ON hr_org_units;
CREATE TRIGGER trg_org_structure_audit
AFTER INSERT OR UPDATE OR DELETE ON hr_org_units
FOR EACH ROW EXECUTE FUNCTION org_structure_audit_trigger();

-- 3. Audit trigger for hr_job_titles
CREATE OR REPLACE FUNCTION hr_job_titles_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO org_structure_audit (org_id, actor_user_id, action, entity_type, entity_id, new_values)
        VALUES (NEW.org_id, (SELECT id FROM la_users WHERE email = (auth.jwt() ->> 'email') LIMIT 1),
                'create', 'job_title', NEW.id, to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO org_structure_audit (org_id, actor_user_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (NEW.org_id, (SELECT id FROM la_users WHERE email = (auth.jwt() ->> 'email') LIMIT 1),
                'update', 'job_title', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO org_structure_audit (org_id, actor_user_id, action, entity_type, entity_id, old_values)
        VALUES (OLD.org_id, (SELECT id FROM la_users WHERE email = (auth.jwt() ->> 'email') LIMIT 1),
                'delete', 'job_title', OLD.id, to_jsonb(OLD));
    END IF;
    RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_hr_job_titles_audit ON hr_job_titles;
CREATE TRIGGER trg_hr_job_titles_audit
AFTER INSERT OR UPDATE OR DELETE ON hr_job_titles
FOR EACH ROW EXECUTE FUNCTION hr_job_titles_audit_trigger();

-- 4. Audit trigger for la_users (org-related fields only)
CREATE OR REPLACE FUNCTION la_users_org_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        OLD.entity_id IS DISTINCT FROM NEW.entity_id OR
        OLD.job_title_id IS DISTINCT FROM NEW.job_title_id OR
        OLD.manager_id IS DISTINCT FROM NEW.manager_id OR
        OLD.department IS DISTINCT FROM NEW.department OR
        OLD.role IS DISTINCT FROM NEW.role
    ) THEN
        INSERT INTO org_structure_audit (org_id, actor_user_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (NEW.org_id, (SELECT id FROM la_users WHERE email = (auth.jwt() ->> 'email') LIMIT 1),
                'update', 'employee_assignment', NEW.id,
                jsonb_build_object(
                    'entity_id', OLD.entity_id, 'job_title_id', OLD.job_title_id,
                    'manager_id', OLD.manager_id, 'department', OLD.department, 'role', OLD.role
                ),
                jsonb_build_object(
                    'entity_id', NEW.entity_id, 'job_title_id', NEW.job_title_id,
                    'manager_id', NEW.manager_id, 'department', NEW.department, 'role', NEW.role
                ));
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_la_users_org_audit ON la_users;
CREATE TRIGGER trg_la_users_org_audit
AFTER UPDATE ON la_users
FOR EACH ROW EXECUTE FUNCTION la_users_org_audit_trigger();

-- 5. Deprecate redundant columns in la_users (keep for backward compat, mark deprecated)
COMMENT ON COLUMN la_users.department IS 'DEPRECATED: Use derived_department_id from entity_id path. To be removed in future migration.';
COMMENT ON COLUMN la_users.position IS 'DEPRECATED: Use job_title_id. To be removed in future migration.';

-- 6. Deprecate redundant columns in employees table
COMMENT ON COLUMN employees.department IS 'DEPRECATED: Use derived_department_id from entity_id path. To be removed in future migration.';
COMMENT ON COLUMN employees.position IS 'DEPRECATED: Use job_title_id. To be removed in future migration.';
COMMENT ON COLUMN employees.department_arabic IS 'DEPRECATED: Use job_title name_arabic via job_title_id.';

-- 7. Drop legacy role column from employees (replaced by wf_user_roles)
-- Keep for now for backward compat, mark deprecated
COMMENT ON COLUMN employees.role IS 'DEPRECATED: Use wf_user_roles. To be removed in future migration.';

-- 6. Create view for consolidated org structure (replaces scattered queries)
CREATE OR REPLACE VIEW v_org_structure AS
SELECT
    u.id as unit_id,
    u.code as unit_code,
    u.name as unit_name,
    u.kind as unit_kind,
    u.head_user_id,
    hu.full_name as head_name,
    d.id as department_id,
    d.code as department_code,
    d.name as department_name,
    dh.full_name as department_head_name,
    div.id as division_id,
    div.code as division_code,
    div.name as division_name,
    divh.full_name as division_head_name
FROM hr_org_units u
LEFT JOIN hr_org_units d ON u.parent_id = d.id AND d.kind = 'department'
LEFT JOIN la_users hu ON u.head_user_id = hu.id
LEFT JOIN hr_org_units div ON (d.parent_id = div.id OR (d.id IS NULL AND u.parent_id = div.id)) AND div.kind = 'division'
LEFT JOIN la_users dh ON d.head_user_id = dh.id
LEFT JOIN la_users divh ON div.head_user_id = divh.id
WHERE u.kind IN ('supervision', 'unit');

-- 7. Create view for employee assignment summary
CREATE OR REPLACE VIEW v_employee_assignment AS
SELECT
    u.id,
    u.email,
    u.full_name,
    u.role,
    u.status,
    u.entity_id,
    u.entity_code,
    u.entity_name,
    u.entity_kind,
    u.job_title_id,
    jt.code as job_title_code,
    jt.name as job_title_name,
    jt.grade as job_title_grade,
    u.department_id,
    u.department_code,
    u.department_name,
    u.division_id,
    u.division_code,
    u.division_name,
    u.manager_id,
    m.full_name as manager_name
FROM (
    SELECT
        lu.id,
        lu.email,
        lu.full_name,
        lu.role,
        lu.status,
        lu.entity_id,
        ou.code as entity_code,
        ou.name as entity_name,
        ou.kind as entity_kind,
        lu.job_title_id,
        lu.derived_department_id as department_id,
        du.code as department_code,
        du.name as department_name,
        lu.derived_division_id as division_id,
        divu.code as division_code,
        divu.name as division_name,
        lu.manager_id
    FROM la_users lu
    LEFT JOIN hr_org_units ou ON lu.entity_id = ou.id
    LEFT JOIN hr_org_units du ON lu.derived_department_id = du.id
    LEFT JOIN hr_org_units divu ON lu.derived_division_id = divu.id
    WHERE lu.status = 'active'
) u
LEFT JOIN hr_job_titles jt ON u.job_title_id = jt.id
LEFT JOIN la_users m ON u.manager_id = m.id;

-- 8. Grants
GRANT SELECT ON org_structure_audit TO authenticated, service_role;
GRANT SELECT ON v_org_structure TO authenticated, service_role;
GRANT SELECT ON v_employee_assignment TO authenticated, service_role;

-- 9. NOTIFY
NOTIFY pgrst, 'reload schema';