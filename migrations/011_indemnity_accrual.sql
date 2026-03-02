
-- Simplified
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS indemnity_accrual NUMERIC(12,3) DEFAULT 0;

DELETE FROM finance_mapping_rules WHERE payroll_item_type = 'indemnity_accrual';

INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
SELECT 'Indemnity Accrual Expense', 'indemnity_accrual', 'EXPAT', id, 'DR'
FROM finance_chart_of_accounts WHERE account_code = '600800';

INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
SELECT 'Indemnity Accrual Provision', 'indemnity_accrual', 'EXPAT', id, 'CR'
FROM finance_chart_of_accounts WHERE account_code = '200300';
