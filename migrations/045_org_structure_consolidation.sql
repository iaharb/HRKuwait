-- 045: Organization Structure Consolidation (Phase 1 - DB)
-- docs/org_structure_consolidation_plan.md Phase 1

-- 1. Job Titles catalog
CREATE TABLE IF NOT EXISTS hr_job_titles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    code         TEXT NOT NULL,
    name         TEXT NOT NULL,
    name_arabic  TEXT,
    department_id UUID REFERENCES hr_org_units(id),  -- links to department entity
    grade        TEXT,  -- e.g. 'G5', 'G6', 'Senior', 'Junior'
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_hr_job_titles_org ON hr_job_titles(org_id);
CREATE INDEX IF NOT EXISTS idx_hr_job_titles_dept ON hr_job_titles(department_id);
CREATE INDEX IF NOT EXISTS idx_hr_job_titles_active ON hr_job_titles(active);

-- updated_at trigger
CREATE OR REPLACE FUNCTION hr_job_titles_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_hr_job_titles_updated_at ON hr_job_titles;
CREATE TRIGGER trg_hr_job_titles_updated_at
BEFORE UPDATE ON hr_job_titles
FOR EACH ROW EXECUTE FUNCTION hr_job_titles_set_updated_at();

-- 2. Add job_title_id to la_users
ALTER TABLE la_users ADD COLUMN IF NOT EXISTS job_title_id UUID REFERENCES hr_job_titles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_la_users_job_title ON la_users(job_title_id);

-- 3. Add job_title_id to employees (portal)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title_id UUID REFERENCES hr_job_titles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_job_title ON employees(job_title_id);

-- 4. Computed department/division on la_users (derived from entity_id path)
-- These are STORED generated columns for query performance
ALTER TABLE la_users
    ADD COLUMN IF NOT EXISTS derived_department_id UUID,
    ADD COLUMN IF NOT EXISTS derived_division_id UUID;

-- Helper function to get department ancestor of an entity
CREATE OR REPLACE FUNCTION get_department_ancestor(p_entity_id UUID)
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_entity hr_org_units%ROWTYPE;
    v_cur UUID;
BEGIN
    IF p_entity_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO v_entity FROM hr_org_units WHERE id = p_entity_id;
    IF v_entity.kind = 'department' THEN RETURN p_entity_id; END IF;
    IF v_entity.kind = 'division' THEN RETURN NULL; END IF;
    v_cur := v_entity.parent_id;
    WHILE v_cur IS NOT NULL LOOP
        SELECT * INTO v_entity FROM hr_org_units WHERE id = v_cur;
        IF v_entity.kind = 'department' THEN RETURN v_cur; END IF;
        v_cur := v_entity.parent_id;
    END LOOP;
    RETURN NULL;
END; $$;

-- Helper function to get division ancestor of an entity
CREATE OR REPLACE FUNCTION get_division_ancestor(p_entity_id UUID)
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_entity hr_org_units%ROWTYPE;
    v_cur UUID;
BEGIN
    IF p_entity_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO v_entity FROM hr_org_units WHERE id = p_entity_id;
    IF v_entity.kind = 'division' THEN RETURN p_entity_id; END IF;
    v_cur := v_entity.parent_id;
    WHILE v_cur IS NOT NULL LOOP
        SELECT * INTO v_entity FROM hr_org_units WHERE id = v_cur;
        IF v_entity.kind = 'division' THEN RETURN v_cur; END IF;
        v_cur := v_entity.parent_id;
    END LOOP;
    RETURN NULL;
END; $$;

-- Update existing rows
UPDATE la_users u
SET derived_department_id = get_department_ancestor(u.entity_id),
    derived_division_id   = get_division_ancestor(u.entity_id)
WHERE u.entity_id IS NOT NULL;

-- Trigger to keep derived columns in sync on entity_id change
CREATE OR REPLACE FUNCTION la_users_sync_derived_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
        NEW.derived_department_id := get_department_ancestor(NEW.entity_id);
        NEW.derived_division_id   := get_division_ancestor(NEW.entity_id);
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_la_users_sync_derived_org ON la_users;
CREATE TRIGGER trg_la_users_sync_derived_org
BEFORE INSERT OR UPDATE ON la_users
FOR EACH ROW EXECUTE FUNCTION la_users_sync_derived_org();

-- 5. Same for employees table (portal)
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS derived_department_id UUID,
    ADD COLUMN IF NOT EXISTS derived_division_id UUID;

UPDATE employees e
SET derived_department_id = get_department_ancestor(e.entity_id),
    derived_division_id   = get_division_ancestor(e.entity_id)
WHERE e.entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION employees_sync_derived_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
        NEW.derived_department_id := get_department_ancestor(NEW.entity_id);
        NEW.derived_division_id   := get_division_ancestor(NEW.entity_id);
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_employees_sync_derived_org ON employees;
CREATE TRIGGER trg_employees_sync_derived_org
BEFORE INSERT OR UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION employees_sync_derived_org();

-- 6. Sync la_users ↔ employees on org fields (entity_id, job_title_id, manager_id)
-- Common fields: id, org_id, entity_id, job_title_id, manager_id, email, full_name/name, department, role, status
CREATE OR REPLACE FUNCTION sync_la_users_to_employees()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO employees (id, org_id, entity_id, job_title_id, manager_id, email, name, department, role, status, created_at, updated_at)
        VALUES (NEW.id, NEW.org_id, NEW.entity_id, NEW.job_title_id, NEW.manager_id, NEW.email, NEW.full_name, NEW.department, NEW.role, NEW.status, now(), now())
        ON CONFLICT (id) DO UPDATE SET
            entity_id = NEW.entity_id,
            job_title_id = NEW.job_title_id,
            manager_id = NEW.manager_id,
            email = NEW.email,
            name = NEW.full_name,
            department = NEW.department,
            role = NEW.role,
            status = NEW.status,
            updated_at = now();
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE employees SET
            entity_id = NEW.entity_id,
            job_title_id = NEW.job_title_id,
            manager_id = NEW.manager_id,
            email = NEW.email,
            name = NEW.full_name,
            department = NEW.department,
            role = NEW.role,
            status = NEW.status,
            updated_at = now()
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_la_users_to_employees ON la_users;
CREATE TRIGGER trg_sync_la_users_to_employees
AFTER INSERT OR UPDATE ON la_users
FOR EACH ROW EXECUTE FUNCTION sync_la_users_to_employees();

-- Reverse sync: employees → la_users (for portal edits)
CREATE OR REPLACE FUNCTION sync_employees_to_la_users()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        UPDATE la_users SET
            entity_id = NEW.entity_id,
            job_title_id = NEW.job_title_id,
            manager_id = NEW.manager_id,
            email = NEW.email,
            full_name = NEW.name,
            department = NEW.department,
            role = NEW.role,
            status = NEW.status,
            updated_at = now()
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_employees_to_la_users ON employees;
CREATE TRIGGER trg_sync_employees_to_la_users
AFTER UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION sync_employees_to_la_users();

-- 7. Seed initial job titles from existing employee data
DO $$
DECLARE
    v_dept_it UUID;
    v_dept_hr UUID;
    v_dept_fin UUID;
    v_dept_sales UUID;
BEGIN
    SELECT id INTO v_dept_it FROM hr_org_units WHERE code = 'IT' AND kind = 'department' LIMIT 1;
    SELECT id INTO v_dept_hr FROM hr_org_units WHERE code = 'HR' AND kind = 'department' LIMIT 1;
    SELECT id INTO v_dept_fin FROM hr_org_units WHERE code = 'FIN' AND kind = 'department' LIMIT 1;
    SELECT id INTO v_dept_sales FROM hr_org_units WHERE code = 'SALES' AND kind = 'department' LIMIT 1;

    INSERT INTO hr_job_titles (org_id, code, name, name_arabic, department_id, grade, description) VALUES
    -- IT Department
    ('00000000-0000-0000-0000-000000000000', 'TECH_CONSULT', 'Technical Consultant', 'مستشار تقني', v_dept_it, 'G7', 'Senior technical advisory role'),
    ('00000000-0000-0000-0000-000000000000', 'SW_DEV', 'Software Developer', 'مطور برمجيات', v_dept_it, 'G6', 'Full-stack development'),
    ('00000000-0000-0000-0000-000000000000', 'SYS_ADMIN', 'System Administrator', 'مدير أنظمة', v_dept_it, 'G5', 'Infrastructure & operations'),
    -- HR Department
    ('00000000-0000-0000-0000-000000000000', 'HR_OFFICER', 'HR Officer', 'أخصائي موارد بشرية', v_dept_hr, 'G5', 'Employee relations & operations'),
    ('00000000-0000-0000-0000-000000000000', 'PAYROLL_OFFICER', 'Payroll Officer', 'أخصائي رواتب', v_dept_hr, 'G5', 'Payroll processing & compliance'),
    -- Finance Department
    ('00000000-0000-0000-0000-000000000000', 'ACCOUNTANT', 'Accountant', 'محاسب', v_dept_fin, 'G6', 'Financial accounting & reporting'),
    ('00000000-0000-0000-0000-000000000000', 'FIN_ANALYST', 'Financial Analyst', 'محلل مالي', v_dept_fin, 'G6', 'FP&A and analysis'),
    -- Sales Department
    ('00000000-0000-0000-0000-000000000000', 'SALES_OFFICER', 'Sales Officer', 'ضابط مبيعات', v_dept_sales, 'G5', 'Sales operations & client management'),
    ('00000000-0000-0000-0000-000000000000', 'MKTG_SPECIALIST', 'Marketing Specialist', 'أخصائي تسويق', v_dept_sales, 'G5', 'Marketing campaigns & brand'),
    -- Generic
    ('00000000-0000-0000-0000-000000000000', 'MANAGER', 'Manager', 'مدير', NULL, 'G7', 'People manager role'),
    ('00000000-0000-0000-0000-000000000000', 'DIRECTOR', 'Director', 'مدير عام', NULL, 'G8', 'Department/Division director'),
    ('00000000-0000-0000-0000-000000000000', 'VP', 'Vice President', 'نائب الرئيس', NULL, 'G9', 'Executive leadership')
    ON CONFLICT (org_id, code) DO NOTHING;
END $$;

-- 8. Backfill job_title_id for existing employees based on their role/department
-- This is a best-effort mapping; manual review recommended
DO $$
DECLARE
    v_jt UUID;
    v_user RECORD;
BEGIN
    FOR v_user IN SELECT id, role, department FROM la_users WHERE status = 'active' AND job_title_id IS NULL LOOP
        v_jt := NULL;
        CASE v_user.role
            WHEN 'ceo' THEN SELECT id INTO v_jt FROM hr_job_titles WHERE code = 'VP' LIMIT 1;
            WHEN 'hr' THEN SELECT id INTO v_jt FROM hr_job_titles WHERE code = 'HR_OFFICER' LIMIT 1;
            WHEN 'manager' THEN SELECT id INTO v_jt FROM hr_job_titles WHERE code = 'MANAGER' LIMIT 1;
            WHEN 'staff' THEN
                IF v_user.department ILIKE '%IT%' THEN SELECT id INTO v_jt FROM hr_job_titles WHERE code = 'TECH_CONSULT' LIMIT 1;
                ELSIF v_user.department ILIKE '%HR%' THEN SELECT id INTO v_jt FROM hr_job_titles WHERE code = 'HR_OFFICER' LIMIT 1;
                ELSIF v_user.department ILIKE '%FIN%' OR v_user.department ILIKE '%FINANCE%' THEN SELECT id INTO v_jt FROM hr_job_titles WHERE code = 'ACCOUNTANT' LIMIT 1;
                ELSIF v_user.department ILIKE '%SALES%' OR v_user.department ILIKE '%MKTG%' THEN SELECT id INTO v_jt FROM hr_job_titles WHERE code = 'SALES_OFFICER' LIMIT 1;
                END IF;
        END CASE;
        IF v_jt IS NOT NULL THEN
            UPDATE la_users SET job_title_id = v_jt WHERE id = v_user.id;
        END IF;
    END LOOP;
END $$;

-- 9. RLS for hr_job_titles (config table pattern)
ALTER TABLE hr_job_titles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_job_titles_read ON hr_job_titles;
CREATE POLICY hr_job_titles_read ON hr_job_titles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS hr_job_titles_write ON hr_job_titles;
CREATE POLICY hr_job_titles_write ON hr_job_titles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON hr_job_titles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON la_users TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO authenticated, service_role;

-- 11. NOTIFY for PostgREST schema reload
NOTIFY pgrst, 'reload schema';