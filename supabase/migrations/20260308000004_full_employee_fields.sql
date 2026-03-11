
-- COMPREHENSIVE SCHEMA ALIGNMENT FOR EMPLOYEES
-- ENSURE ALL FIELDS FROM THE 'EMPLOYEE' INTERFACE ARE PHYSICALLY PRESENT AS COLUMNS

-- 1. ADD MISSING IDENTITY COLUMNS
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS second_name TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS third_name TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS fourth_name TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS family_name TEXT;

ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS title_ar TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS first_name_ar TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS second_name_ar TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS third_name_ar TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS fourth_name_ar TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS family_name_ar TEXT;

-- 2. ADD MISSING CONTACT & HR COLUMNS
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS pifss_status TEXT DEFAULT 'Pending';
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS training_hours INTEGER DEFAULT 0;

-- 3. ENSURE EXPIRY COLUMNS ARE DATE TYPES (SAFE CONVERSION)
-- Move to temporary columns if they are Currently TEXT to avoid cast errors, then move back
DO $$ 
BEGIN
    -- civil_id_expiry
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='civil_id_expiry' AND data_type='text') THEN
        ALTER TABLE employees ALTER COLUMN civil_id_expiry TYPE DATE USING (NULLIF(civil_id_expiry, '')::DATE);
    END IF;
    -- passport_expiry
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='passport_expiry' AND data_type='text') THEN
        ALTER TABLE employees ALTER COLUMN passport_expiry TYPE DATE USING (NULLIF(passport_expiry, '')::DATE);
    END IF;
    -- join_date
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='join_date' AND data_type='text') THEN
        ALTER TABLE employees ALTER COLUMN join_date TYPE DATE USING (NULLIF(join_date, '')::DATE);
    END IF;
END $$;

-- 4. ADD IZN AMAL EXPIRY IF MISSING
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS izn_amal_expiry DATE;

-- 5. ENSURE STRUCTURED RELATIONSHIPS
-- We allow NULLs for manager_id for now to avoid blocking seed/upserts
ALTER TABLE IF EXISTS employees DROP CONSTRAINT IF EXISTS employees_manager_id_fkey;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS manager_id UUID;
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS manager_name TEXT;

-- 6. ENSURE ROLE COLUMN IS PRESENT
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Employee';

-- 7. NOTIFY POSTGREST
NOTIFY pgrst, 'reload schema';
