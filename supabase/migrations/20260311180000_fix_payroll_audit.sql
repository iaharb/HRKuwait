
-- Sentinel V13: The 'Null-Safe Auditor'
-- Fixes 'Null Balance' in UI by ensuring breakdowns are never empty and formulas are resilient.
-- Includes Indemnity Accrual and PIFSS Employer Share.

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run_id UUID;
    v_month_start DATE;
    v_month_end DATE;
    v_total_work_days_in_month INTEGER;
BEGIN
    -- 1. Identify Month Boundaries from 'YYYY-MM-CYCLE' or 'YYYY-MM'
    v_month_start := TO_DATE(SUBSTRING(p_period_key FROM 1 FOR 7) || '-01', 'YYYY-MM-DD');
    v_month_end := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_total_work_days_in_month := fn_count_working_days(v_month_start, v_month_end);

    -- 2. Cleanup existing Draft to avoid unique constraint violations
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';

    -- 3. Create Draft Run Record
    v_run_id := uuid_generate_v4();
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 4. Calculate and Insert Items
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, housing_allowance, 
        other_allowances, leave_deductions, annual_leave_pay, sick_leave_pay, 
        performance_bonus, company_bonus, overtime_amount,
        pifss_deduction, pifss_employer_share, indemnity_accrual,
        net_salary, verified_by_hr, created_at,
        allowance_breakdown, deduction_breakdown
    )
    SELECT 
        v_run_id, 
        e.id, 
        e.name,
        
        -- basic_salary (Worked portions of salary)
        (e.salary / 26.0) * (26.0 - LEAST(26.0, (COALESCE(lc.leave_days, 0) + COALESCE(lc.already_paid_days, 0)))),
        
        COALESCE(al.housing, 0),
        COALESCE(al.others, 0),
        
        0, -- leave_deductions (Deprecated/calculated as pro-rata Basic)
        
        (e.salary / 26.0) * COALESCE(lc.annual_days, 0),
        (e.salary / 26.0) * COALESCE(lc.sick_days, 0),
        
        COALESCE(vc.perf, 0),
        COALESCE(vc.pool, 0),
        COALESCE(vc.ot, 0),
        
        -- Employee PIFSS (11.5%)
        CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.115) ELSE 0 END,
        
        -- Employer PIFSS (13.5%)
        CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.135) ELSE 0 END,
        
        -- Indemnity Accrual (0.5 Month/Year = 1.25 days/month)
        CASE WHEN e.nationality = 'Expat' THEN (e.salary / 24.0) ELSE 0 END,  -- Simplified 15 days pay per year
        
        -- Final Net Salary
        (
            ((e.salary / 26.0) * (26.0 - LEAST(26.0, (COALESCE(lc.unpaid_days, 0) + COALESCE(lc.already_paid_days, 0))))) -- Basic - (Unpaid + AlreadyPaid)
            + COALESCE(al.housing, 0) + COALESCE(al.others, 0)
            + COALESCE(vc.perf, 0) + COALESCE(vc.pool, 0) + COALESCE(vc.ot, 0)
            - (CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.115) ELSE 0 END)
        ),
        
        FALSE,
        NOW(),

        -- Allowance Breakdown (Earnings)
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
          FROM (
            SELECT 'Basic Pay (Work)' as name, (e.salary / 26.0) * (26.0 - LEAST(26.0, (COALESCE(lc.leave_days, 0) + COALESCE(lc.already_paid_days, 0)))) as val
            UNION ALL
            SELECT 'Housing Allowance', COALESCE(al.housing, 0)
            UNION ALL
            SELECT 'Other Fixed Allowances', COALESCE(al.others, 0)
            UNION ALL
            SELECT 'Annual Leave Pay (' || COALESCE(lc.annual_days, 0) || 'd)', (e.salary / 26.0) * COALESCE(lc.annual_days, 0)
            UNION ALL
            SELECT 'Sick Leave Pay (' || COALESCE(lc.sick_days, 0) || 'd)', (e.salary / 26.0) * COALESCE(lc.sick_days, 0)
            UNION ALL
            SELECT 'Performance Bonus', COALESCE(vc.perf, 0)
            UNION ALL
            SELECT 'Company Pool Bonus', COALESCE(vc.pool, 0)
            UNION ALL
            SELECT 'Overtime Amount', COALESCE(vc.ot, 0)
          ) a WHERE val > 0
        ), '[]'::jsonb),

        -- Deduction Breakdown
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
          FROM (
            SELECT 'PIFSS Social Security' as name, (e.salary * 0.115) as val WHERE e.nationality = 'Kuwaiti'
            UNION ALL
            SELECT 'Unpaid Leave Offset', (e.salary / 26.0) * COALESCE(lc.unpaid_days, 0) WHERE COALESCE(lc.unpaid_days, 0) > 0
            UNION ALL
            SELECT 'Adjustment Filter (V6)', 0 WHERE FALSE
          ) d WHERE val > 0
        ), '[]'::jsonb)

    FROM employees e
    -- Lateral for Allowances
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN is_housing THEN value ELSE 0 END) as housing,
            SUM(CASE WHEN NOT is_housing THEN value ELSE 0 END) as others
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    -- Lateral for VC
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN comp_type = 'PERFORMANCE_BONUS' THEN amount ELSE 0 END) as perf,
            SUM(CASE WHEN comp_type = 'COMPANY_BONUS' THEN amount ELSE 0 END) as pool,
            SUM(CASE WHEN comp_type = 'OVERTIME' THEN amount ELSE 0 END) as ot
        FROM variable_compensation 
        WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    -- Lateral for Leaves logic
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN lr.type = 'Annual' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END) as annual_days,
            SUM(CASE WHEN lr.type = 'Sick' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END) as sick_days,
            SUM(CASE WHEN lr.status = 'Unpaid' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END) as unpaid_days,
            -- Sum of already paid days in this month from finalized Leave_Runs
            COALESCE((
                SELECT SUM(fn_count_working_days(GREATEST(v_month_start, pr.locked_start), LEAST(v_month_end, pr.locked_end)))
                FROM payroll_runs pr
                JOIN payroll_items pi ON pr.id = pi.run_id
                WHERE pi.employee_id = e.id AND pr.cycle_type = 'Leave_Run' AND pr.status = 'Finalized'
                  AND pr.locked_start <= v_month_end AND pr.locked_end >= v_month_start
            ), 0) as already_paid_days,
            -- Total leave days for Basic pay exclusion
            COALESCE(SUM(fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date))), 0) as leave_days
        FROM leave_requests lr 
        WHERE lr.employee_id = e.id 
          AND lr.status IN ('Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
          AND lr.start_date <= v_month_end AND lr.end_date >= v_month_start
    ) lc ON TRUE
    WHERE e.status = 'Active' AND e.join_date <= v_month_end;

    -- 5. Finalize totals for the run record
    UPDATE payroll_runs 
    SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id)
    WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
