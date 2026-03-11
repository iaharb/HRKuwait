
-- Migration: Add missing payroll item columns
-- Ensures columns used by Hub and Monthly payroll are present

ALTER TABLE payroll_items 
ADD COLUMN IF NOT EXISTS sick_leave_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS annual_leave_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS allowance_breakdown JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS deduction_breakdown JSONB DEFAULT '[]';

-- Also ensure any other missing columns from base schema or recent logic are here
ALTER TABLE payroll_items 
ADD COLUMN IF NOT EXISTS pifss_employer_share NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS indemnity_accrual NUMERIC DEFAULT 0;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
