-- 020_structured_names.sql
-- Transition from single 'name' column to structured 6-part naming convention

BEGIN;

-- 1. Add new structural columns for English names
ALTER TABLE employees ADD COLUMN IF NOT EXISTS title TEXT; -- Dr, Mr, Eng, etc.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS second_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS third_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fourth_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS family_name TEXT;

-- 2. Add structural columns for Arabic names
ALTER TABLE employees ADD COLUMN IF NOT EXISTS title_ar TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_name_ar TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS second_name_ar TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS third_name_ar TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fourth_name_ar TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS family_name_ar TEXT;

-- 3. Attempt initial data migration from the old 'name' column
-- This logic assumes space-separated names and identifies titles
UPDATE employees
SET 
    title = CASE 
        WHEN lower(split_part(name, ' ', 1)) IN ('dr', 'dr.', 'mr', 'mr.', 'ms', 'ms.', 'mrs', 'mrs.', 'eng', 'eng.', 'prof', 'prof.') 
        THEN split_part(name, ' ', 1) 
        ELSE NULL 
    END,
    first_name = CASE 
        WHEN lower(split_part(name, ' ', 1)) IN ('dr', 'dr.', 'mr', 'mr.', 'ms', 'ms.', 'mrs', 'mrs.', 'eng', 'eng.', 'prof', 'prof.') 
        THEN split_part(name, ' ', 2) 
        ELSE split_part(name, ' ', 1) 
    END,
    family_name = split_part(name, ' ', array_length(string_to_array(trim(name), ' '), 1))
WHERE title IS NULL AND first_name IS NULL;

-- 4. Keep the original 'name' column as the 'Full Name' for display purposes
-- We'll keep it as a regular column for now but update our app to maintain its value
COMMENT ON COLUMN employees.name IS 'Display full name (concatenated parts)';
COMMENT ON COLUMN employees.name_arabic IS 'Display full name Arabic (concatenated parts)';

-- Refresh Schema
NOTIFY pgrst, 'reload schema';

COMMIT;
