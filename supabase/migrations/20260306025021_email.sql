-- Migration: 021 Add Email to Employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT;
