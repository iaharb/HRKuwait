
-- 013_standardize_roles.sql
-- Add the role column to employees table to support standardized system roles

ALTER TABLE employees ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Employee';

-- Set existing roles if possible based on position (best effort)
UPDATE employees SET role = 'Admin' WHERE position ILIKE '%CEO%' OR position ILIKE '%Super%';
UPDATE employees SET role = 'HR Manager' WHERE position ILIKE '%HR Manager%';
UPDATE employees SET role = 'HR Officer' WHERE position ILIKE '%HR Officer%';
UPDATE employees SET role = 'Payroll Manager' WHERE position ILIKE '%Payroll Manager%';
UPDATE employees SET role = 'Payroll Officer' WHERE position ILIKE '%Payroll Officer%';
UPDATE employees SET role = 'Manager' WHERE position ILIKE '%Lead%' OR position ILIKE '%Head%';

-- Force a schema reload for PostgREST
NOTIFY pgrst, 'reload schema';
