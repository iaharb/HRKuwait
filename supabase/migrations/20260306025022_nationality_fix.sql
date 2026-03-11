-- Migration: Fix Nationality Enum Comparison in Payroll
-- Fixes: operator does not exist: nationality_group_enum = text

CREATE OR REPLACE FUNCTION fn_generate_journal_entries(p_run_id UUID)
RETURNS VOID AS $$
DECLARE
    v_period_key TEXT;
    v_entry_date DATE;
    v_year INT;
    v_month INT;
BEGIN
    -- 0. Get the period and determine entry date (28th of the month)
    SELECT period_key INTO v_period_key FROM payroll_runs WHERE id = p_run_id;
    
    -- Extract year and month from YYYY-MM
    -- Pattern: 2026-01 or sometimes LR-NAME-2026-01
    IF v_period_key ~ '\d{4}-\d{2}' THEN
      v_year := (REGEXP_MATCHES(v_period_key, '(\d{4})-(\d{2})'))[1]::INT;
      v_month := (REGEXP_MATCHES(v_period_key, '(\d{4})-(\d{2})'))[2]::INT;
    ELSE
      v_year := EXTRACT(YEAR FROM NOW())::INT;
      v_month := EXTRACT(MONTH FROM NOW())::INT;
    END IF;

    v_entry_date := (v_year || '-' || v_month || '-28')::DATE;

    -- 1. Clear existing entries for this run
    DELETE FROM journal_entries WHERE payroll_run_id = p_run_id;

    -- 2. Insert new entries by joining items, employees, cost centers, and rules
    -- Added explicit text casting for r.nationality_group to handle enum comparison
    INSERT INTO journal_entries (
        payroll_run_id,
        employee_id,
        cost_center_id,
        gl_account_id,
        amount,
        entry_date,
        entry_type
    )
    SELECT 
        p_run_id,
        e.id as employee_id,
        cc.id as cost_center_id,
        r.gl_account_id,
        CASE 
            WHEN r.payroll_item_type = 'basic_salary' THEN pi.basic_salary
            WHEN r.payroll_item_type = 'housing_allowance' THEN pi.housing_allowance
            WHEN r.payroll_item_type = 'other_allowances' THEN pi.other_allowances
            WHEN r.payroll_item_type = 'sick_leave' THEN pi.sick_leave_pay
            WHEN r.payroll_item_type = 'annual_leave' THEN pi.annual_leave_pay
            WHEN r.payroll_item_type = 'net_salary_payable' THEN pi.net_salary
            WHEN r.payroll_item_type = 'pifss_employer_share' THEN pi.pifss_employer_share
            WHEN r.payroll_item_type = 'pifss_deduction' THEN pi.pifss_deduction
            WHEN r.payroll_item_type = 'indemnity_accrual' THEN pi.indemnity_accrual
            ELSE 0
        END as amount,
        v_entry_date,
        r.credit_or_debit
    FROM payroll_items pi
    JOIN employees e ON pi.employee_id = e.id
    JOIN finance_cost_centers cc ON e.department = cc.department_id
    JOIN finance_mapping_rules r ON (
        r.nationality_group::text = 'ALL' OR 
        r.nationality_group::text = (CASE WHEN LOWER(e.nationality) = 'kuwaiti' THEN 'LOCAL' ELSE 'EXPAT' END)
    )
    WHERE pi.run_id = p_run_id
      AND (
        (r.payroll_item_type = 'basic_salary' AND pi.basic_salary > 0) OR
        (r.payroll_item_type = 'housing_allowance' AND pi.housing_allowance > 0) OR
        (r.payroll_item_type = 'other_allowances' AND pi.other_allowances > 0) OR
        (r.payroll_item_type = 'sick_leave' AND pi.sick_leave_pay > 0) OR
        (r.payroll_item_type = 'annual_leave' AND pi.annual_leave_pay > 0) OR
        (r.payroll_item_type = 'net_salary_payable' AND pi.net_salary > 0) OR
        (r.payroll_item_type = 'pifss_employer_share' AND pi.pifss_employer_share > 0) OR
        (r.payroll_item_type = 'pifss_deduction' AND pi.pifss_deduction > 0) OR
        (r.payroll_item_type = 'indemnity_accrual' AND pi.indemnity_accrual > 0)
      );

END;
$$ LANGUAGE plpgsql;
