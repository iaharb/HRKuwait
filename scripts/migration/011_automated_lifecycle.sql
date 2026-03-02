
-- Migration: Automated Accounting and Lifecycle Logic
-- Transports manual script logic into automated database triggers.

-- 1. Function to automatically generate Journal Entries for a Payroll Run
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
    v_year := SUBSTRING(v_period_key FROM 1 FOR 4)::INT;
    v_month := SUBSTRING(v_period_key FROM 6 FOR 2)::INT;
    v_entry_date := (v_year || '-' || v_month || '-28')::DATE;

    -- 1. Clear existing entries for this run
    DELETE FROM journal_entries WHERE payroll_run_id = p_run_id;

    -- 2. Insert new entries by joining items, employees, cost centers, and rules
    -- We use a CROSS JOIN LATERAL or UNNEST approach to handle the multiple parts (basic, housing, etc.)
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
        r.nationality_group = 'ALL' OR 
        r.nationality_group = (CASE WHEN LOWER(e.nationality) = 'kuwaiti' THEN 'LOCAL' ELSE 'EXPAT' END)
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

-- 2. Trigger to invoke JV generation when payroll is finalized
CREATE OR REPLACE FUNCTION trg_fn_payroll_status_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IN ('Finalized', 'finalized', 'Locked', 'locked') AND OLD.status NOT IN ('Finalized', 'finalized', 'Locked', 'locked')) THEN
        PERFORM fn_generate_journal_entries(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payroll_finalize_jv ON payroll_runs;
CREATE TRIGGER trg_payroll_finalize_jv
AFTER UPDATE ON payroll_runs
FOR EACH ROW
EXECUTE FUNCTION trg_fn_payroll_status_audit();

-- 3. Dynamic Leave Balance Recalculation (Fixes the hardcoded '2026' issue)
CREATE OR REPLACE FUNCTION update_leave_balances()
RETURNS TRIGGER AS $$
DECLARE
    emp_id UUID;
    v_year INT;
    v_annual NUMERIC := 0;
    v_sick NUMERIC := 0;
    v_hajj NUMERIC := 0;
    v_emergency NUMERIC := 0;
    v_short_perm NUMERIC := 0;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        emp_id := OLD.employee_id;
        v_year := EXTRACT(YEAR FROM OLD.start_date)::INT;
    ELSE
        emp_id := NEW.employee_id;
        v_year := EXTRACT(YEAR FROM NEW.start_date)::INT;
    END IF;

    -- Recalculate for the specific year of the request
    WITH approved_leaves AS (
        SELECT 
            type, 
            COALESCE(SUM(days), 0) as total_days,
            COALESCE(SUM(duration_hours), 0) as total_hours
        FROM leave_requests
        WHERE employee_id = emp_id
          AND EXTRACT(YEAR FROM start_date) = v_year
          AND status IN ('Manager_Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
        GROUP BY type
    )
    SELECT 
        COALESCE((SELECT SUM(CASE WHEN type = 'ShortPermission' THEN total_hours / 8.0 ELSE total_days END) FROM approved_leaves WHERE type NOT IN ('Sick', 'Hajj')), 0),
        COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Sick'), 0),
        COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Hajj'), 0),
        COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Emergency'), 0),
        COALESCE((SELECT total_hours FROM approved_leaves WHERE type = 'ShortPermission'), 0)
    INTO v_annual, v_sick, v_hajj, v_emergency, v_short_perm;

    -- Update or Insert if balance row missing for that year
    INSERT INTO leave_balances (employee_id, leave_type, year, entitled_days, used_days)
    VALUES 
        (emp_id, 'Annual', v_year, 30, ROUND(v_annual, 2)),
        (emp_id, 'Sick', v_year, 15, ROUND(v_sick, 2)),
        (emp_id, 'Emergency', v_year, 6, ROUND(v_emergency, 2)),
        (emp_id, 'ShortPermission', v_year, 2, ROUND(v_short_perm, 2)),
        (emp_id, 'Hajj', v_year, 1, ROUND(v_hajj, 2))
    ON CONFLICT (employee_id, leave_type, year) 
    DO UPDATE SET used_days = EXCLUDED.used_days;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 4. Registry Integrity Sweeper (Function for Cron)
-- Checks for document expiries and creates system notifications automatically.
CREATE OR REPLACE FUNCTION fn_registry_health_sweep()
RETURNS VOID AS $$
BEGIN
    -- Civil ID Expiry Notifications
    INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
    SELECT 
        id as user_id,
        'Document Expiry Warning' as title,
        'Your Civil ID is expiring on ' || civil_id_expiry || '. Please update your record.' as message,
        'warning' as type,
        false as is_read,
        now()
    FROM employees
    WHERE civil_id_expiry <= (CURRENT_DATE + INTERVAL '30 days')
      AND NOT EXISTS (
          SELECT 1 FROM notifications 
          WHERE user_id = employees.id 
          AND title = 'Document Expiry Warning' 
          AND created_at > (CURRENT_DATE - INTERVAL '7 days') -- Prevent spamming
      );
END;
$$ LANGUAGE plpgsql;
