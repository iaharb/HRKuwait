-- Migration: Fix Straddle Leave and Advance Settlements in Monthly Payroll
-- This ensures employees paid via Hub Payout (Off-cycle) or having advanced leaves
-- are correctly reflected (deducted or adjusted) in the regular Monthly run.

-- 0. Ensure required columns exist in payroll_items
ALTER TABLE payroll_items 
ADD COLUMN IF NOT EXISTS sick_leave_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS annual_leave_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS allowance_breakdown JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS deduction_breakdown JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS pifss_employer_share NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS indemnity_accrual NUMERIC DEFAULT 0;

-- 1. Utility Function to count working days (Excluding Fridays)
CREATE OR REPLACE FUNCTION fn_count_working_days(p_start DATE, p_end DATE)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_curr DATE := p_start;
BEGIN
    WHILE v_curr <= p_end LOOP
        IF EXTRACT(DOW FROM v_curr) <> 5 THEN -- 5 is Friday
            v_count := v_count + 1;
        END IF;
        v_curr := v_curr + 1;
    END LOOP;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 2. Enhanced Payroll Generation RPC
CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run_id UUID;
    v_total_disbursement NUMERIC := 0;
    v_month_start DATE;
    v_month_end DATE;
    v_total_work_days_in_month INTEGER;
BEGIN
    -- Determine month bounds from p_period_key (YYYY-MM or YYYY-MM-CYCLE)
    v_month_start := TO_DATE(SUBSTRING(p_period_key FROM 1 FOR 7) || '-01', 'YYYY-MM-DD');
    v_month_end := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_total_work_days_in_month := fn_count_working_days(v_month_start, v_month_end);

    -- Delete existing draft for this period
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';

    v_run_id := gen_random_uuid();

    -- Insert Run
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW());

    -- Insert Items with Straddle Awareness
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, housing_allowance, 
        other_allowances, leave_deductions, annual_leave_pay, sick_leave_pay, 
        pifss_deduction, net_salary, verified_by_hr, created_at
    )
    SELECT 
        v_run_id, 
        e.id, 
        e.name, 
        -- Basic Salary Prorated (Subtract units already paid in Hub or Unpaid)
        (e.salary / 26.0) * (26.0 - LEAST(26.0, ((COALESCE(leave_calcs.days_already_paid, 0) + COALESCE(leave_calcs.unpaid_days, 0))::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0))),
        
        -- Housing Allowance
        COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = true), 0),
        
        -- Other Allowances
        COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = false), 0),
        
        -- Leave Deductions
        (e.salary / 26.0) * LEAST(26.0, ((COALESCE(leave_calcs.days_already_paid, 0) + COALESCE(leave_calcs.unpaid_days, 0))::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0)),
        
        -- Annual Leave Pay (Deferred)
        (e.salary / 26.0) * LEAST(26.0, (COALESCE(leave_calcs.annual_leave_days, 0)::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0)),
        
        -- Sick Leave Pay (Deferred)
        (e.salary / 26.0) * LEAST(26.0, (COALESCE(leave_calcs.sick_leave_days, 0)::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0)),

        -- PIFSS
        CASE 
            WHEN e.nationality = 'Kuwaiti' AND COALESCE(leave_calcs.days_already_paid, 0) < v_total_work_days_in_month THEN (e.salary * 0.115) 
            ELSE 0 
        END,
        
        -- Net Salary Calculation
        (
          ((e.salary + COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id), 0)) / 26.0) 
          * (26.0 - LEAST(26.0, ((COALESCE(leave_calcs.days_already_paid, 0) + COALESCE(leave_calcs.unpaid_days, 0))::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0)))
        ) - (CASE WHEN e.nationality = 'Kuwaiti' AND COALESCE(leave_calcs.days_already_paid, 0) < v_total_work_days_in_month THEN (e.salary * 0.115) ELSE 0 END),
        
        FALSE,
        NOW()
    FROM employees e
    LEFT JOIN LATERAL (
        SELECT 
            SUM(days_already_paid) as days_already_paid,
            SUM(unpaid_days) as unpaid_days,
            SUM(annual_leave_days) as annual_leave_days,
            SUM(sick_leave_days) as sick_leave_days
        FROM (
            -- 1. Days already paid in a finalized Leave_Run (Settled via Hub)
            SELECT 
                fn_count_working_days(
                    GREATEST(v_month_start, pr.locked_start),
                    LEAST(v_month_end, pr.locked_end)
                ) as days_already_paid,
                0 as unpaid_days,
                0 as annual_leave_days,
                0 as sick_leave_days
            FROM payroll_runs pr
            JOIN payroll_items pi ON pr.id = pi.run_id
            WHERE pi.employee_id = e.id 
              AND pr.cycle_type = 'Leave_Run' 
              AND pr.status = 'Finalized'
              AND pr.locked_start <= v_month_end
              AND pr.locked_end >= v_month_start
            
            UNION ALL
            
            -- 2. Pushed to Payroll leaves (deferred)
            SELECT 
                0,
                CASE WHEN lr.type = 'Unpaid' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END,
                CASE WHEN lr.type = 'Annual' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END,
                CASE WHEN lr.type = 'Sick' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END
            FROM leave_requests lr
            WHERE lr.employee_id = e.id
              AND lr.status = 'Pushed_To_Payroll'
              AND lr.start_date <= v_month_end
              AND lr.end_date >= v_month_start
        ) sub
    ) leave_calcs ON TRUE
    WHERE e.status = 'Active';

    -- Update total
    UPDATE payroll_runs 
    SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id)
    WHERE id = v_run_id
    RETURNING total_disbursement INTO v_total_disbursement;

    RETURN jsonb_build_object('id', v_run_id, 'total', v_total_disbursement);
END;
$$;
