-- Sentinel V17: The 'Excel Sovereign' (Stabilized)
-- Strictly follows 'Salary Calculations.csv' logic.
-- Always uses Divisor = 26.0 and excludes Fridays.
-- Pays (Base + All Additive Allowances) for Work days.
-- Pays (Base + Non-Deductible Allowances) for Leave days.
-- Leaves marked as 'Sick' follows 15/10/10/10/30 segments.

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run_id UUID;
    v_month_start DATE;
    v_month_end DATE;
    v_year_start DATE;
BEGIN
    -- 1. Boundaries
    v_month_start := TO_DATE(SUBSTRING(p_period_key FROM 1 FOR 7) || '-01', 'YYYY-MM-DD');
    v_month_end := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_year_start := TO_DATE(EXTRACT(YEAR FROM v_month_start) || '-01-01', 'YYYY-MM-DD');

    -- 2. Cleanup existing Draft
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';

    -- 3. Create Draft Run Record
    v_run_id := uuid_generate_v4();
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 4. Calculate and Insert Items
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, housing_allowance, 
        other_allowances, net_salary, allowance_breakdown, deduction_breakdown
    )
    SELECT 
        v_run_id, 
        e.id, 
        e.name,
        e.salary,
        COALESCE(al.housing_sum, 0),
        COALESCE(al.others_sum, 0),
        
        -- Final Net Transaction Pay (Row 28 in Excel)
        (
            COALESCE(calc.work_pay_total, 0)
            + COALESCE(calc.leave_pay_total, 0)
            + COALESCE(vc.ot, 0) + COALESCE(vc.bonus, 0)
            - (CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.115) ELSE 0 END)
            - COALESCE(lp.already_paid_net, 0)
        ),
        
        -- Breakdown
        jsonb_build_array(
            jsonb_build_object('name', 'Prorated Monthly Pay', 'value', COALESCE(calc.work_pay_total, 0) + COALESCE(calc.leave_pay_total, 0))
        ) || 
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', comp_type, 'value', total_val)) FROM (
            SELECT 'Overtime' as comp_type, COALESCE(vc.ot, 0) as total_val WHERE COALESCE(vc.ot, 0) > 0
            UNION ALL
            SELECT 'Bonuses', COALESCE(vc.bonus, 0) WHERE COALESCE(vc.bonus, 0) > 0
        ) q), '[]'::jsonb),

        -- Deductions
        jsonb_build_array(
            jsonb_build_object('name', 'PIFSS (11.5%)', 'value', (CASE WHEN e.nationality = 'Kuwaiti' THEN e.salary * 0.115 ELSE 0 END))
        ) ||
        CASE WHEN lp.already_paid_net > 0 THEN jsonb_build_array(jsonb_build_object('name', 'Settlement Check Offset', 'value', lp.already_paid_net)) ELSE '[]'::jsonb END

    FROM employees e
    -- Lateral for Allowances: Separate Additive (Work) from Non-Deductible (Leave)
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN (ea.name ILIKE '%housing%' OR ea.name NOT ILIKE '%deductible%') THEN (CASE WHEN ea.type = 'Percentage' THEN (e.salary * ea.value / 100) ELSE ea.value END) ELSE 0 END) as allowed_during_leave_sum,
            SUM(CASE WHEN (ea.name ILIKE '%housing%') THEN (CASE WHEN ea.type = 'Percentage' THEN (e.salary * ea.value / 100) ELSE ea.value END) ELSE 0 END) as housing_sum,
            SUM(CASE WHEN (ea.name NOT ILIKE '%housing%') THEN (CASE WHEN ea.type = 'Percentage' THEN (e.salary * ea.value / 100) ELSE ea.value END) ELSE 0 END) as others_sum,
            SUM(CASE WHEN ea.type = 'Percentage' THEN (e.salary * ea.value / 100) ELSE ea.value END) as total_fixed_sum
        FROM employee_allowances ea WHERE ea.employee_id = e.id
    ) al ON TRUE
    -- Lateral for VC
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN comp_type = 'OVERTIME' THEN amount ELSE 0 END) as ot,
            SUM(CASE WHEN comp_type != 'OVERTIME' THEN amount ELSE 0 END) as bonus
        FROM variable_compensation 
        WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    -- Lateral for Settlements
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pi.net_salary), 0) as already_paid_net
        FROM payroll_runs pr
        JOIN payroll_items pi ON pr.id = pi.run_id
        WHERE pi.employee_id = e.id 
          AND pr.period_key LIKE SUBSTRING(p_period_key FROM 1 FOR 7) || '%'
          AND pr.cycle_type = 'Leave_Run' AND pr.status = 'Finalized'
    ) lp ON TRUE
    -- Central Calculation Logic
    LEFT JOIN LATERAL (
        WITH month_leaves AS (
            SELECT 
                lr.id, lr.type, lr.start_date, lr.end_date,
                GREATEST(v_month_start, lr.start_date) as eff_start,
                LEAST(v_month_end, lr.end_date) as eff_end,
                COALESCE((
                    SELECT SUM(fn_count_working_days(start_date, end_date))
                    FROM leave_requests lr2 
                    WHERE lr2.employee_id = e.id AND lr2.type = 'Sick' AND lr2.status IN ('Paid','Approved','HR_Finalized')
                      AND lr2.start_date >= v_year_start AND lr2.start_date < v_month_start
                ), 0) as ytd_sick_before
            FROM leave_requests lr 
            WHERE lr.employee_id = e.id 
              AND lr.start_date <= v_month_end AND lr.end_date >= v_month_start
              AND lr.status IN ('Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
        ),
        work_counting AS (
            SELECT 
                -- Business Days in month = 26 (avg/divisor) -- user says 26 is the base divider
                -- We count actual work days and apply the (Salary + Allowances) / 26 logic
                fn_count_working_days(v_month_start, v_month_end) as month_biz_days,
                COALESCE((SELECT SUM(fn_count_working_days(eff_start, eff_end)) FROM month_leaves), 0) as leave_biz_days
        )
        SELECT 
            -- Work Pay = (Monthly Business Days - Leave Business Days) * (Full Gross / 26)
            ( (wc.month_biz_days - wc.leave_biz_days) * (e.salary + COALESCE(al.total_fixed_sum, 0)) / 26.0 ) as work_pay_total,
            -- Leave Pay (Individual calculation for sick segments)
            COALESCE((
                SELECT SUM(
                    ( (e.salary + COALESCE(al.allowed_during_leave_sum, 0)) / 26.0 ) 
                    * (CASE WHEN type = 'Sick' THEN (
                        SELECT AVG(CASE 
                            WHEN (ytd_sick_before + i) <= 15 THEN 1.0
                            WHEN (ytd_sick_before + i) <= 25 THEN 0.75
                            WHEN (ytd_sick_before + i) <= 35 THEN 0.50
                            WHEN (ytd_sick_before + i) <= 45 THEN 0.25
                            ELSE 0.0 END)
                        FROM generate_series(1, fn_count_working_days(eff_start, eff_end)) i
                    ) ELSE 1.0 END)
                ) FROM month_leaves
            ), 0) as leave_pay_total
        FROM work_counting wc
    ) calc ON TRUE
    WHERE e.status = 'Active' AND e.join_date <= v_month_end;

    RETURN jsonb_build_object('payroll_run_id', v_run_id);
END;
$$;
