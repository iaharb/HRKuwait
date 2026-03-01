-- Migration 005: Fix Finance Rollup View to include payroll_run_id and filter by status
-- This ensures that only Finalized or Locked payroll runs are included in financial analytics.

CREATE OR REPLACE VIEW view_financial_rollup AS
SELECT 
    je.payroll_run_id,
    cc.segment_name,
    coa.account_name,
    e.nationality AS nationality_status,
    SUM(je.amount) as total_amount
FROM journal_entries je
JOIN payroll_runs pr ON je.payroll_run_id = pr.id
JOIN finance_cost_centers cc ON je.cost_center_id = cc.id
JOIN finance_chart_of_accounts coa ON je.gl_account_id = coa.id
JOIN employees e ON je.employee_id = e.id
WHERE pr.status IN ('Finalized', 'Locked', 'finalized', 'locked')
GROUP BY je.payroll_run_id, cc.segment_name, coa.account_name, e.nationality;

-- Notify postgrest to reload
NOTIFY pgrst, 'reload schema';
