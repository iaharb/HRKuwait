-- ==============================================================================
-- 1. SEED: FINANCE CHART OF ACCOUNTS
-- ==============================================================================
-- We use ON CONFLICT (account_code) DO NOTHING so you can run this safely 
-- multiple times without duplicating your Chart of Accounts.

INSERT INTO finance_chart_of_accounts (account_code, account_name, account_type, is_active)
VALUES
  -- Expenses (DR)
  ('600100', 'Basic Salaries Expense', 'EXPENSE', true),
  ('600200', 'Housing Allowance Expense', 'EXPENSE', true),
  ('600300', 'Transport Allowance Expense', 'EXPENSE', true),
  ('600400', 'Other Allowances Expense', 'EXPENSE', true),
  ('600500', 'Sick Leave Expense', 'EXPENSE', true),
  ('600600', 'Annual Leave Expense', 'EXPENSE', true),
  ('600700', 'PIFSS Employer Contribution', 'EXPENSE', true),
  ('600800', 'Indemnity (EOSB) Expense', 'EXPENSE', true),
  
  -- Liabilities (CR)
  ('200100', 'Net Salaries Payable', 'LIABILITY', true),
  ('200200', 'PIFSS Payable', 'LIABILITY', true),
  ('200300', 'Provision for Indemnity (EOSB)', 'LIABILITY', true),
  ('200400', 'Taxes / Deductions Payable', 'LIABILITY', true)
ON CONFLICT (account_code) DO NOTHING;


-- ==============================================================================
-- 2. SEED: FINANCE MAPPING RULES
-- ==============================================================================
-- Since GL Account IDs are dynamic UUIDs, we use subqueries to find the 
-- correct account ID based on the account_code we just created above.

-- CLEAR existing default rules (Optional: ensures a clean slate)
TRUNCATE TABLE finance_mapping_rules;

INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, credit_or_debit, gl_account_id)
VALUES
  -- 1. ALL NATIONALITIES: Basic Earnings (Debits to Expense)
  ('Basic Salary - All', 'basic_salary', 'ALL', 'DR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600100')),
    
  ('Housing Allowance - All', 'housing_allowance', 'ALL', 'DR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600200')),
    
  ('Transport Allowance - All', 'transport_allowance', 'ALL', 'DR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600300')),
    
  ('Other Allowances - All', 'other_allowances', 'ALL', 'DR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600400')),

  ('Sick Leave - All', 'sick_leave', 'ALL', 'DR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600500')),
    
  ('Annual Leave - All', 'annual_leave', 'ALL', 'DR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600600')),

  -- 2. KUWAITI ONLY (LOCAL): PIFSS Rules
  -- Employee deduction (Reduces net pay, increases payable)
  ('PIFSS Employee Share - Kuwaiti', 'pifss_deduction_employee', 'LOCAL', 'CR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '200200')),
    
  -- Employer expense (Company cost)
  ('PIFSS Employer Expense - Kuwaiti', 'pifss_deduction_employer', 'LOCAL', 'DR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600700')),

  -- Employer payable (Matches the expense to accrue the liability)
  ('PIFSS Employer Payable - Kuwaiti', 'pifss_payable_employer', 'LOCAL', 'CR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '200200')),

  -- 3. EXPAT ONLY: Indemnity and Taxation
  -- Accrual Expense
  ('Indemnity Expense - Expat', 'indemnity_accrual', 'EXPAT', 'DR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600800')),
    
  -- Accrual Liability
  ('Indemnity Provision - Expat', 'indemnity_provision', 'EXPAT', 'CR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '200300')),

  -- Kuwait Tax (If applicable for foreign entities/specific contracts)
  ('Tax Deduction - Expat', 'kuwait_tax', 'EXPAT', 'CR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '200400')),

  -- 4. ALL NATIONALITIES: Net Pay
  -- The final amount actually wired to the bank
  ('Net Salary Payable - All', 'net_salary_payable', 'ALL', 'CR', 
    (SELECT id FROM finance_chart_of_accounts WHERE account_code = '200100'));