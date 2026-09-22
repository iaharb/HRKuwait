-- Migration: 023_fix_employee_update_policy.sql
-- Allow employees to update their own biometric face token and certain profile fields.

BEGIN;

-- Drop existing restricted policy if it exists
DROP POLICY IF EXISTS "Emp: View Own Record" ON employees;

-- 1. Create a more robust View policy
CREATE POLICY "Emp: View Own Record" 
ON employees FOR SELECT 
TO authenticated 
USING (id::text = get_my_id()::text);

-- 2. Create the missing UPDATE policy for employees
-- This allows them to register signatures (face_token) and update their own contact info
CREATE POLICY "Emp: Update Own Record" 
ON employees FOR UPDATE 
TO authenticated 
USING (id::text = get_my_id()::text)
WITH CHECK (
    id::text = get_my_id()::text
);

-- Ensure RLS is enabled (should already be)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

COMMIT;
