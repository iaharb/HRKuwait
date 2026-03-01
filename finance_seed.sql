-- Seed Data for Finance GL Mapping Engine

-- 1. Insert Default Chart of Accounts
INSERT INTO finance_chart_of_accounts (account_code, account_name, account_type, is_active)
VALUES 
    ('600100', 'Basic Salary Expense', 'EXPENSE', true),
    ('600200', 'Housing Allowance Expense', 'EXPENSE', true),
    ('600300', 'Other Allowances Expense', 'EXPENSE', true),
    ('600400', 'PIFSS Employer Contribution Expense', 'EXPENSE', true),
    ('200100', 'Net Salary Payable', 'LIABILITY', true),
    ('200200', 'PIFSS Payable', 'LIABILITY', true)
ON CONFLICT (account_code) DO NOTHING;

-- 2. Insert Default Cost Centers
-- We map these to the department names found in the system (e.g., 'Management', 'HR', 'Engineering', 'Sales', 'Finance')
INSERT INTO finance_cost_centers (department_id, cost_center_code, segment_name)
VALUES 
    ('Management', 'CC-100', 'Exec Management HQ'),
    ('HR', 'CC-200', 'Human Resources Operations'),
    ('Engineering', 'CC-300', 'Tech & Engineering'),
    ('Sales', 'CC-400', 'Sales & Marketing'),
    ('Finance', 'CC-500', 'Finance & Admin')
ON CONFLICT (cost_center_code) DO NOTHING;

-- 3. Insert Default Mapping Rules
-- Note: We map rules dynamically based on account names inserted above
DO $$ 
DECLARE
    sal_exp UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600100');
    house_exp UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600200');
    allow_exp UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600300');
    pifss_empl_exp UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600400');
    net_pay UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '200100');
    pifss_pay UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '200200');
BEGIN
    -- 1. Basic Salary (DR)
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
    VALUES ('Basic Salary DR', 'basic_salary', 'ALL', sal_exp, 'DR');

    -- 2. Housing Allowance (DR)
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
    VALUES ('Housing Allowance DR', 'housing_allowance', 'ALL', house_exp, 'DR');

    -- 3. Other Allowances (DR)
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
    VALUES ('Other Allowances DR', 'other_allowances', 'ALL', allow_exp, 'DR');

    -- 4. Net Salary (CR)
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
    VALUES ('Net Salary CR (Local)', 'net_salary', 'LOCAL', net_pay, 'CR');
    
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
    VALUES ('Net Salary CR (Expat)', 'net_salary', 'EXPAT', net_pay, 'CR');

    -- 5. PIFSS Employer Share (DR) for Locals
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
    VALUES ('PIFSS Employer Expense DR', 'pifss_employer_share', 'LOCAL', pifss_empl_exp, 'DR');

    -- 6. PIFSS Total Payable (CR) for Locals
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
    VALUES ('PIFSS Payable CR', 'pifss_deduction', 'LOCAL', pifss_pay, 'CR');
END $$;
