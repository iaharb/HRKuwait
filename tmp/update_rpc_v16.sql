-- Sentinel V16: The 'Bilingual Compliance Sovereign'
-- Standardizes Kuwaiti Sick Leave (15/10/10/10/30) and ensures 'Full Pay' inclusion for ALL fixed allowances.
-- Handles Percentage Allowances, Deductible tags, and subtracts already-paid Leave Runs.

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
    v_total_work_days_in_month INTEGER;
BEGIN
    -- 1. Identify Boundaries
    v_month_start := TO_DATE(SUBSTRING(p_period_key FROM 1 FOR 7) || '-01', 'YYYY-MM-DD');
    v_month_end := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_year_start := TO_DATE(EXTRACT(YEAR FROM v_month_start) || '-01-01', 'YYYY-MM-DD');
    v_total_work_days_in_month := fn_count_working_days(v_month_start, v_month_end);

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
        
        -- Start with Full Salary
        e.salary,
        
        COALESCE(al.housing, 0),
        COALESCE(al.others_sum, 0),
        
        -- Final Net Calculation (Adding Fixed + VC, subtracting Deductions + AlreadyPaid)
        (
            e.salary 
            + COALESCE(al.housing, 0) + COALESCE(al.others_sum, 0)
            + COALESCE(vc.perf, 0) + COALESCE(vc.pool, 0) + COALESCE(vc.ot, 0)
            - COALESCE(lc.total_deduction_val, 0)
            - COALESCE(al.deductible_sum, 0)
            - COALESCE(lp.already_paid_net, 0) -- SUBTRACT PREVIOUSLY SETTLED LEAVE RUNS
            - (CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.115) ELSE 0 END)
        ),
        
        -- Allowance Breakdown (Earnings)
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
          FROM (
            SELECT 'Basic Salary' as name, e.salary as val
            UNION ALL
            SELECT 'Housing Allowance', COALESCE(al.housing, 0)
            UNION ALL
            SELECT name, val FROM unnest(al.e_n, al.e_v) t(name, val)
            UNION ALL
            SELECT 'Performance Bonus', COALESCE(vc.perf, 0)
            UNION ALL
            SELECT 'Company Pool Bonus', COALESCE(vc.pool, 0)
            UNION ALL
            SELECT 'Overtime Amount', COALESCE(vc.ot, 0)
          ) a WHERE val != 0
        ), '[]'::jsonb),

        -- Deduction Breakdown
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
          FROM (
            SELECT 'PIFSS Social Security' as name, (e.salary * 0.115) as val WHERE e.nationality = 'Kuwaiti'
            UNION ALL
            SELECT name, val FROM unnest(al.d_n, al.d_v) t(name, val)
            UNION ALL
            SELECT 'Unpaid Leave (' || COALESCE(lc.unpaid_days, 0) || 'd)', (e.salary / 26.0) * COALESCE(lc.unpaid_days, 0) WHERE COALESCE(lc.unpaid_days, 0) > 0
            UNION ALL
            SELECT 'Sick Leave Adj.', COALESCE(lc.sick_deduction_val, 0) WHERE COALESCE(lc.sick_deduction_val, 0) > 0
            UNION ALL
            SELECT 'Auto Settlement Deduction', lp.already_paid_net WHERE lp.already_paid_net > 0
          ) d WHERE val != 0
        ), '[]'::jsonb)

    FROM employees e
    -- Lateral for Allowances
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN ea.is_housing THEN (CASE WHEN ea.type = 'Percentage' THEN (e.salary * ea.value / 100) ELSE ea.value END) ELSE 0 END) as housing,
            SUM(CASE WHEN NOT ea.is_housing AND ea.name NOT LIKE '%(deductible)%' THEN (CASE WHEN ea.type = 'Percentage' THEN (e.salary * ea.value / 100) ELSE ea.value END) ELSE 0 END) as others_sum,
            SUM(CASE WHEN NOT ea.is_housing AND ea.name LIKE '%(deductible)%' THEN (CASE WHEN ea.type = 'Percentage' THEN (e.salary * ea.value / 100) ELSE ea.value END) ELSE 0 END) as deductible_sum,
            array_agg(ea.name) FILTER (WHERE NOT ea.is_housing AND ea.name NOT LIKE '%(deductible)%') as e_n,
            array_agg(CASE WHEN ea.type = 'Percentage' THEN (e.salary * ea.value / 100) ELSE ea.value END) FILTER (WHERE NOT ea.is_housing AND ea.name NOT LIKE '%(deductible)%') as e_v,
            array_agg(ea.name) FILTER (WHERE NOT ea.is_housing AND ea.name LIKE '%(deductible)%') as d_n,
            array_agg(CASE WHEN ea.type = 'Percentage' THEN (e.salary * ea.value / 100) ELSE ea.value END) FILTER (WHERE NOT ea.is_housing AND ea.name LIKE '%(deductible)%') as d_v
        FROM employee_allowances ea WHERE ea.employee_id = e.id
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
    -- Lateral for Previously Paid Settlements in this period
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pi.net_salary), 0) as already_paid_net
        FROM payroll_runs pr
        JOIN payroll_items pi ON pr.id = pi.run_id
        WHERE pi.employee_id = e.id 
          AND pr.period_key LIKE SUBSTRING(p_period_key FROM 1 FOR 7) || '%'
          AND pr.cycle_type = 'Leave_Run' AND pr.status = 'Finalized'
    ) lp ON TRUE
    -- Lateral for Leaves with Segment Logic
    LEFT JOIN LATERAL (
        WITH stats AS (
            SELECT 
                COALESCE(SUM(fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date))), 0) as month_sick_days,
                COALESCE((
                    SELECT SUM(fn_count_working_days(lr2.start_date, lr2.end_date))
                    FROM leave_requests lr2 
                    WHERE lr2.employee_id = e.id AND lr2.type = 'Sick' 
                      AND lr2.status IN ('Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
                      AND lr2.start_date >= v_year_start AND lr2.start_date < v_month_start
                ), 0) as ytd_before,
                COALESCE(SUM(CASE WHEN lr.status = 'Unpaid' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END), 0) as unpaid_days
            FROM leave_requests lr 
            WHERE lr.employee_id = e.id 
              AND lr.start_date <= v_month_end AND lr.end_date >= v_month_start
              AND lr.status IN ('Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
        ),
        calc AS (
            SELECT 
                *,
                (e.salary + COALESCE(al.housing, 0) + COALESCE(al.others_sum, 0)) as full_gross
            FROM stats
        )
        SELECT 
            unpaid_days,
            month_sick_days as sick_days,
            COALESCE((SELECT SUM(CASE 
                WHEN (ytd_before + i) <= 15 THEN 0
                WHEN (ytd_before + i) <= 25 THEN 0.25 * (full_gross / 26.0)
                WHEN (ytd_before + i) <= 35 THEN 0.50 * (full_gross / 26.0)
                WHEN (ytd_before + i) <= 45 THEN 0.75 * (full_gross / 26.0)
                ELSE 1.0 * (full_gross / 26.0)
            END) FROM generate_series(1, NULLIF(month_sick_days, 0)) i), 0) as sick_deduction_val,
            (
                (unpaid_days * (full_gross / 26.0))
                + COALESCE((SELECT SUM(CASE 
                    WHEN (ytd_before + i) <= 15 THEN 0
                    WHEN (ytd_before + i) <= 25 THEN 0.25 * (full_gross / 26.0)
                    WHEN (ytd_before + i) <= 35 THEN 0.50 * (full_gross / 26.0)
                    WHEN (ytd_before + i) <= 45 THEN 0.75 * (full_gross / 26.0)
                    ELSE 1.0 * (full_gross / 26.0)
                END) FROM generate_series(1, NULLIF(month_sick_days, 0)) i), 0)
            ) as total_deduction_val
        FROM calc
    ) lc ON TRUE
    WHERE e.status = 'Active' AND e.join_date <= v_month_end;

    -- 5. Finalize totals
    UPDATE payroll_runs 
    SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id)
    WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
