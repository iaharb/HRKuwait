-- Add bonus columns to payroll_items
ALTER TABLE payroll_items 
ADD COLUMN IF NOT EXISTS performance_bonus NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS company_bonus NUMERIC DEFAULT 0;
