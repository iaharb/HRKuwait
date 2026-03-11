
-- ENSURE ROLE COLUMN EXISTS IN EMPLOYEES TABLE
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Employee';

-- RE-SYNC ROLES FROM app_users TO employees IF THEY ARE LINKED
UPDATE employees e
SET role = u.role
FROM app_users u
WHERE u.employee_id = e.id;

-- RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';
