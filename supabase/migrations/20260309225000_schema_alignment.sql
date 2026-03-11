
-- Migration: Final Schema Alignment for Payroll and Leaves
-- Ensures all fields used in code (frontend & RPCs) are permanently available.

-- 1. Alignment for payroll_runs (Needed for Hub Payouts and Straddle tracking)
ALTER TABLE payroll_runs 
ADD COLUMN IF NOT EXISTS locked_start DATE,
ADD COLUMN IF NOT EXISTS locked_end DATE,
ADD COLUMN IF NOT EXISTS target_leave_id UUID;

-- 2. Alignment for payroll_items (Ensuring logic matching standard payslip types)
ALTER TABLE payroll_items 
ADD COLUMN IF NOT EXISTS sick_leave_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS annual_leave_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS allowance_breakdown JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS deduction_breakdown JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS pifss_employer_share NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS indemnity_accrual NUMERIC DEFAULT 0;

-- 3. Alignment for leave_requests (Ensuring tracking of push status)
-- (Pushed_To_Payroll already exists in constraint, but ensuring consistency)
ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS pushed_to_payroll_at TIMESTAMP WITH TIME ZONE;

-- 4. Refresh Cache
NOTIFY pgrst, 'reload schema';
