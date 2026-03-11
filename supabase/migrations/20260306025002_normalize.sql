-- =============================================================================
-- MIGRATION 001: Normalize JSONB columns into proper relational tables
-- Targets:
--   employees.leave_balances  (jsonb)  → leave_balances table
--   employees.allowances      (jsonb)  → employee_allowances table
--   leave_requests.history    (jsonb)  → leave_history table
--   Merge duplicate: department_configs + department_metrics → departments table
--   Drop redundant column: employees.leave_balance_annual
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LEAVE BALANCES TABLE
-- Replaces: employees.leave_balances (jsonb)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_balances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type      TEXT NOT NULL,           -- Annual | Sick | Emergency | ShortPermission | Hajj
    entitled_days   NUMERIC NOT NULL DEFAULT 0,
    used_days       NUMERIC NOT NULL DEFAULT 0,
    year            INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (employee_id, leave_type, year)
);

-- Migrate existing JSONB leave_balances into rows
INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT
    id AS employee_id,
    'Annual'         AS leave_type,
    COALESCE((leave_balances->>'annual')::numeric, 30)       AS entitled_days,
    COALESCE((leave_balances->>'annualUsed')::numeric, 0)    AS used_days,
    COALESCE(last_reset_year, EXTRACT(YEAR FROM NOW()))::int AS year
FROM employees
WHERE leave_balances IS NOT NULL
ON CONFLICT (employee_id, leave_type, year) DO NOTHING;

INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT
    id,
    'Sick',
    COALESCE((leave_balances->>'sick')::numeric, 15),
    COALESCE((leave_balances->>'sickUsed')::numeric, 0),
    COALESCE(last_reset_year, EXTRACT(YEAR FROM NOW()))::int
FROM employees
WHERE leave_balances IS NOT NULL
ON CONFLICT (employee_id, leave_type, year) DO NOTHING;

INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT
    id,
    'Emergency',
    COALESCE((leave_balances->>'emergency')::numeric, 6),
    COALESCE((leave_balances->>'emergencyUsed')::numeric, 0),
    COALESCE(last_reset_year, EXTRACT(YEAR FROM NOW()))::int
FROM employees
WHERE leave_balances IS NOT NULL
ON CONFLICT (employee_id, leave_type, year) DO NOTHING;

INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT
    id,
    'ShortPermission',
    COALESCE((leave_balances->>'shortPermissionLimit')::numeric, 2),
    COALESCE((leave_balances->>'shortPermissionUsed')::numeric, 0),
    COALESCE(last_reset_year, EXTRACT(YEAR FROM NOW()))::int
FROM employees
WHERE leave_balances IS NOT NULL
ON CONFLICT (employee_id, leave_type, year) DO NOTHING;

INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT
    id,
    'Hajj',
    1,
    CASE WHEN (leave_balances->>'hajUsed')::boolean = true THEN 1 ELSE 0 END,
    COALESCE(last_reset_year, EXTRACT(YEAR FROM NOW()))::int
FROM employees
WHERE leave_balances IS NOT NULL
ON CONFLICT (employee_id, leave_type, year) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EMPLOYEE ALLOWANCES TABLE
-- Replaces: employees.allowances (jsonb)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_allowances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    name_arabic     TEXT,
    type            TEXT NOT NULL DEFAULT 'Fixed',  -- Fixed | Percentage
    value           NUMERIC NOT NULL DEFAULT 0,
    is_housing      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migrate JSONB allowances array into rows
INSERT INTO employee_allowances (employee_id, name, name_arabic, type, value, is_housing)
SELECT
    e.id AS employee_id,
    elem->>'name'        AS name,
    elem->>'nameArabic'  AS name_arabic,
    COALESCE(elem->>'type', 'Fixed') AS type,
    COALESCE((elem->>'value')::numeric, 0) AS value,
    COALESCE((elem->>'isHousing')::boolean, false) AS is_housing
FROM employees e,
     jsonb_array_elements(e.allowances) AS elem
WHERE e.allowances IS NOT NULL
  AND jsonb_typeof(e.allowances) = 'array';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LEAVE HISTORY TABLE
-- Replaces: leave_requests.history (jsonb)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_history (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    leave_request_id  UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
    actor_name        TEXT NOT NULL,
    actor_role        TEXT NOT NULL,
    action            TEXT NOT NULL,
    note              TEXT,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migrate JSONB history array into rows
INSERT INTO leave_history (leave_request_id, actor_name, actor_role, action, note, created_at)
SELECT
    lr.id AS leave_request_id,
    COALESCE(elem->>'user', 'System')     AS actor_name,
    COALESCE(elem->>'role', 'System')     AS actor_role,
    COALESCE(elem->>'action', 'Update')   AS action,
    elem->>'note'                          AS note,
    COALESCE(
        (elem->>'timestamp')::timestamptz,
        lr.created_at
    )                                      AS created_at
FROM leave_requests lr,
     jsonb_array_elements(lr.history) AS elem
WHERE lr.history IS NOT NULL
  AND jsonb_typeof(lr.history) = 'array';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MERGE department_configs + department_metrics → departments
-- Both tables held overlapping department data (target_ratio duplicated, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    name_arabic     TEXT,
    target_ratio    NUMERIC NOT NULL DEFAULT 30,  -- % Kuwaiti target
    kuwaiti_count   INTEGER NOT NULL DEFAULT 0,
    expat_count     INTEGER NOT NULL DEFAULT 0,
    headcount_goal  INTEGER,
    manager_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Merge: use department_metrics as base (it has Arabic + counts), enrich with configs data
INSERT INTO departments (name, name_arabic, target_ratio, kuwaiti_count, expat_count, headcount_goal, manager_id)
SELECT
    COALESCE(m.name, c.dept_name)                     AS name,
    m.name_arabic,
    COALESCE(m.target_ratio, c.target_ratio, 30)      AS target_ratio,
    COALESCE(m.kuwaiti_count, 0)                      AS kuwaiti_count,
    COALESCE(m.expat_count, 0)                        AS expat_count,
    c.headcount_goal,
    c.manager_id
FROM department_metrics m
FULL OUTER JOIN department_configs c ON lower(m.name) = lower(c.dept_name)
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ADD FK ON employees.department → departments.name (soft reference via text)
--    Keep as text to avoid heavy migration, but ensure referential awareness
-- ─────────────────────────────────────────────────────────────────────────────
-- (no structural FK needed — the app joins on text match, departments table 
--  is the single source of truth for department metadata)


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DROP OBSOLETE COLUMNS & TABLES (after migration confirmed)
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop the redundant leave_balance_annual column (was already superseded by leave_balances jsonb)
ALTER TABLE employees DROP COLUMN IF EXISTS leave_balance_annual;

-- We intentionally KEEP the original JSONB columns for one release cycle
-- as a safety net. They can be dropped in migration 002 once the app is confirmed stable.
-- ALTER TABLE employees DROP COLUMN IF EXISTS leave_balances;
-- ALTER TABLE employees DROP COLUMN IF EXISTS allowances;
-- ALTER TABLE leave_requests DROP COLUMN IF EXISTS history;
-- DROP TABLE IF EXISTS department_configs;
-- DROP TABLE IF EXISTS department_metrics;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY & PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE leave_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_allowances DISABLE ROW LEVEL SECURITY;
ALTER TABLE leave_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;

GRANT ALL ON leave_balances TO anon, authenticated, service_role;
GRANT ALL ON employee_allowances TO anon, authenticated, service_role;
GRANT ALL ON leave_history TO anon, authenticated, service_role;
GRANT ALL ON departments TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. NOTIFY POSTGREST TO RELOAD SCHEMA CACHE
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
