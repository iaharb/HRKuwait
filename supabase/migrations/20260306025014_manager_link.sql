
-- Migration to add manager_id to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_name TEXT;

-- Update existing employees to have managers based on seed data
-- 001 is CEO (Faisal)
-- 002 is HR Manager (Layla)
-- 003 is IT Lead (Ahmed)
-- 004 is Developer (Sarah)
-- 005 is Engineer (John)

UPDATE employees SET manager_id = '00000000-0000-0000-0000-000000000001', manager_name = 'Dr. Faisal Al-Sabah' 
WHERE id IN ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');

UPDATE employees SET manager_id = '00000000-0000-0000-0000-000000000003', manager_name = 'Ahmed Al-Mutairi' 
WHERE id IN ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005');

-- CEO has no manager (or himself)
UPDATE employees SET manager_id = NULL, manager_name = NULL WHERE id = '00000000-0000-0000-0000-000000000001';

NOTIFY pgrst, 'reload schema';
