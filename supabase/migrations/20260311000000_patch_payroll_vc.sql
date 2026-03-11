-- Migration: Patch Payroll Engine to include Variable Compensation (VC)
-- Aggregates approved Overtime and Bonuses into the monthly payroll draft.

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

    -- Insert Items with Straddle Awareness and VC Aggregation
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, housing_allowance, 
        other_allowances, leave_deductions, annual_leave_pay, sick_leave_pay, 
        performance_bonus, company_bonus, overtime_amount,
        pifss_deduction, net_salary, verified_by_hr, created_at,
        allowance_breakdown, deduction_breakdown
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

        -- Performance Bonus from VC
        COALESCE((SELECT SUM(amount) FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND comp_type = 'BONUS' AND sub_type = 'Performance_Bonus'), 0),

        -- Company Bonus (Profit Sharing) from VC
        COALESCE((SELECT SUM(amount) FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND comp_type = 'BONUS' AND sub_type = 'Profit_Sharing'), 0),

        -- Overtime from VC
        COALESCE((SELECT SUM(amount) FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND comp_type = 'OVERTIME'), 0),

        -- PIFSS
        CASE 
            WHEN e.nationality = 'Kuwaiti' AND COALESCE(leave_calcs.days_already_paid, 0) < v_total_work_days_in_month THEN (e.salary * 0.115) 
            ELSE 0 
        END,
        
        -- Net Salary Calculation (Total Earnings - Total Deductions)
        (
          -- Basic Salary
          ((e.salary / 26.0) * (26.0 - LEAST(26.0, ((COALESCE(leave_calcs.days_already_paid, 0) + COALESCE(leave_calcs.unpaid_days, 0))::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0))))) + 
          -- Housing
          COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = true), 0) +
          -- Other Fixed Allowances
          COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = false), 0) +
          -- Leave Payouts
          ((e.salary / 26.0) * LEAST(26.0, (COALESCE(leave_calcs.annual_leave_days, 0)::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0))) +
          ((e.salary / 26.0) * LEAST(26.0, (COALESCE(leave_calcs.sick_leave_days, 0)::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0))) +
          -- Variable Compensation
          COALESCE((SELECT SUM(amount) FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND comp_type = 'BONUS' AND sub_type = 'Performance_Bonus'), 0) +
          COALESCE((SELECT SUM(amount) FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND comp_type = 'BONUS' AND sub_type = 'Profit_Sharing'), 0) +
          COALESCE((SELECT SUM(amount) FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND comp_type = 'OVERTIME'), 0) -
          -- Deductions (PIFSS)
          (CASE WHEN e.nationality = 'Kuwaiti' AND COALESCE(leave_calcs.days_already_paid, 0) < v_total_work_days_in_month THEN (e.salary * 0.115) ELSE 0 END),
        
        FALSE,
        NOW(),
        
        -- Build allowance_breakdown JSON
        (
          SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
          FROM (
            SELECT 'Basic Pay (Work)' as name, (e.salary / 26.0) * (26.0 - LEAST(26.0, ((COALESCE(leave_calcs.days_already_paid, 0) + COALESCE(leave_calcs.unpaid_days, 0))::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0))) as val
            UNION ALL
            SELECT 'Housing Allowance', COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = true), 0)
            UNION ALL
            SELECT 'Other Allowances', COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = false), 0)
            UNION ALL
            SELECT 'Annual Leave Pay', (e.salary / 26.0) * LEAST(26.0, (COALESCE(leave_calcs.annual_leave_days, 0)::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0))
            UNION ALL
            SELECT 'Sick Leave Pay', (e.salary / 26.0) * LEAST(26.0, (COALESCE(leave_calcs.sick_leave_days, 0)::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0))
            UNION ALL
            SELECT 'Performance Bonus', COALESCE((SELECT SUM(amount) FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND comp_type = 'BONUS' AND sub_type = 'Performance_Bonus'), 0)
            UNION ALL
            SELECT 'Profit Sharing Bonus', COALESCE((SELECT SUM(amount) FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND comp_type = 'BONUS' AND sub_type = 'Profit_Sharing'), 0)
            UNION ALL
            SELECT 'Overtime Amount', COALESCE((SELECT SUM(amount) FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND comp_type = 'OVERTIME'), 0)
          ) a WHERE val > 0
        ),

        -- Build deduction_breakdown JSON
        (
          SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
          FROM (
            SELECT 'PIFSS Social Security' as name, (CASE WHEN e.nationality = 'Kuwaiti' AND COALESCE(leave_calcs.days_already_paid, 0) < v_total_work_days_in_month THEN (e.salary * 0.115) ELSE 0 END) as val
            UNION ALL
            SELECT 'Pro-rata Loss (Leave Offset)', (e.salary / 26.0) * LEAST(26.0, ((COALESCE(leave_calcs.days_already_paid, 0) + COALESCE(leave_calcs.unpaid_days, 0))::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0))
          ) d WHERE val > 0
        )

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
