
-- =============================================================================
-- MODERN SEED: Hydrate Normalized Tables
-- =============================================================================

-- 1. TRUNCATE NEW TABLES
TRUNCATE departments, leave_balances, employee_allowances, leave_history CASCADE;

-- 2. SEED DEPARTMENTS
INSERT INTO departments (name, name_arabic, target_ratio, kuwaiti_count, expat_count)
VALUES 
('Executive', 'الإدارة التنفيذية', 100, 1, 0),
('HR', 'الموارد البشرية', 100, 1, 0),
('IT', 'تقنية المعلومات', 75, 2, 1),
('Finance', 'الشؤون المالية', 100, 0, 0),
('Operations', 'العمليات', 50, 0, 0)
ON CONFLICT (name) DO NOTHING;

-- 3. Hydrate leave_balances
INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT
    id AS employee_id,
    'Annual' AS leave_type,
    COALESCE((leave_balances->>'annual')::numeric, 30) AS entitled_days,
    COALESCE((leave_balances->>'annualUsed')::numeric, 0) AS used_days,
    2026 AS year
FROM employees;

INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT id, 'Sick', COALESCE((leave_balances->>'sick')::numeric, 15), COALESCE((leave_balances->>'sickUsed')::numeric, 0), 2026 FROM employees;

INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT id, 'Emergency', COALESCE((leave_balances->>'emergency')::numeric, 6), COALESCE((leave_balances->>'emergencyUsed')::numeric, 0), 2026 FROM employees;

INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT id, 'ShortPermission', COALESCE((leave_balances->>'shortPermissionLimit')::numeric, 2), COALESCE((leave_balances->>'shortPermissionUsed')::numeric, 0), 2026 FROM employees;

-- 4. Hydrate employee_allowances
INSERT INTO employee_allowances (employee_id, name, name_arabic, type, value, is_housing)
SELECT
    e.id AS employee_id,
    elem->>'name' AS name,
    elem->>'nameArabic' AS name_arabic,
    COALESCE(elem->>'type', 'Fixed') AS type,
    COALESCE((elem->>'value')::numeric, 0) AS value,
    COALESCE((elem->>'isHousing')::boolean, false) AS is_housing
FROM employees e, jsonb_array_elements(e.allowances) AS elem
WHERE e.allowances IS NOT NULL AND jsonb_typeof(e.allowances) = 'array';

-- 5. Hydrate leave_history
INSERT INTO leave_history (leave_request_id, actor_name, actor_role, action, note, created_at)
SELECT
    lr.id AS leave_request_id,
    COALESCE(elem->>'user', 'System') AS actor_name,
    COALESCE(elem->>'role', 'System') AS actor_role,
    COALESCE(elem->>'action', 'Update') AS action,
    elem->>'note' AS note,
    COALESCE((elem->>'timestamp')::timestamptz, lr.created_at) AS created_at
FROM leave_requests lr, jsonb_array_elements(lr.history) AS elem
WHERE lr.history IS NOT NULL AND jsonb_typeof(lr.history) = 'array';
