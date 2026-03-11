-- FINANCE CORE SCHEMA
-- Reconstructing the missing Finance Engine tables.

-- 1. Chart of Accounts
CREATE TABLE IF NOT EXISTS finance_chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_code TEXT UNIQUE NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL, -- EXPENSE, LIABILITY, ASSET
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Cost Centers
CREATE TABLE IF NOT EXISTS finance_cost_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id TEXT NOT NULL, -- Links to departments.name or legacy departments
    cost_center_code TEXT UNIQUE NOT NULL,
    segment_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Mapping Rules
CREATE TABLE IF NOT EXISTS finance_mapping_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_name TEXT NOT NULL,
    payroll_item_type TEXT NOT NULL,
    nationality_group TEXT NOT NULL, -- LOCAL, EXPAT, ALL
    gl_account_id UUID REFERENCES finance_chart_of_accounts(id),
    credit_or_debit TEXT NOT NULL, -- DR, CR
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_run_id UUID NOT NULL, -- Can link to payroll_runs or profit_bonus_pools
    employee_id UUID REFERENCES employees(id),
    cost_center_id UUID REFERENCES finance_cost_centers(id),
    gl_account_id UUID REFERENCES finance_chart_of_accounts(id),
    payroll_item_type TEXT,
    amount NUMERIC(15,3) NOT NULL DEFAULT 0,
    entry_date DATE NOT NULL,
    entry_type TEXT NOT NULL, -- DR, CR
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Seed Basic Accounts
INSERT INTO finance_chart_of_accounts (account_code, account_name, account_type, is_active)
VALUES 
    ('600100', 'Basic Salary Expense', 'EXPENSE', true),
    ('600200', 'Housing Allowance Expense', 'EXPENSE', true),
    ('600300', 'Other Allowances Expense', 'EXPENSE', true),
    ('600400', 'PIFSS Employer Contribution Expense', 'EXPENSE', true),
    ('600800', 'Indemnity Expense', 'EXPENSE', true),
    ('200100', 'Net Salary Payable', 'LIABILITY', true),
    ('200200', 'PIFSS Payable', 'LIABILITY', true),
    ('200300', 'Indemnity Provision', 'LIABILITY', true),
    ('510400', 'Bonus Accrual Expense', 'EXPENSE', true),
    ('210500', 'Bonus Payable', 'LIABILITY', true)
ON CONFLICT (account_code) DO NOTHING;

-- Seed Basic Cost Centers (Matching initial departments)
INSERT INTO finance_cost_centers (department_id, cost_center_code, segment_name)
VALUES 
    ('Executive', 'CC-100', 'Exec Management HQ'),
    ('HR', 'CC-200', 'Human Resources Operations'),
    ('IT', 'CC-300', 'Tech & Engineering'),
    ('Finance', 'CC-500', 'Finance & Admin')
ON CONFLICT (cost_center_code) DO NOTHING;

-- Disable RLS for Bootstrap
ALTER TABLE finance_chart_of_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE finance_cost_centers DISABLE ROW LEVEL SECURITY;
ALTER TABLE finance_mapping_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries DISABLE ROW LEVEL SECURITY;

GRANT ALL ON finance_chart_of_accounts TO anon, authenticated, service_role;
GRANT ALL ON finance_cost_centers TO anon, authenticated, service_role;
GRANT ALL ON finance_mapping_rules TO anon, authenticated, service_role;
GRANT ALL ON journal_entries TO anon, authenticated, service_role;
