-- Sentinel V19: The 'Detailed Registry'
-- Replaces 'Prorated Monthly Pay' with granular Work/Leave segments per Excel logic.
-- Shows 'Days Worked Pay', 'Leave Base Pay', and 'Leave Housing Pay' as separate items.

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run_id UUID := uuid_generate_v4();
    v_month_start DATE := TO_DATE(SUBSTRING(p_period_key FROM 1 FOR 7) || '-01', 'YYYY-MM-DD');
    v_month_end DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_year_start DATE := TO_DATE(EXTRACT(YEAR FROM v_month_start) || '-01-01', 'YYYY-MM-DD');
BEGIN
    -- 1. Cleanup existing Draft to avoid conflicts
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';

    -- 2. Create the Draft Run record
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 3. Calculate and Insert Items with Granular Breakdown
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, net_salary, 
        allowance_breakdown, deduction_breakdown
    )
    SELECT 
        v_run_id, 
        e.id, 
        e.name,
        e.salary,
        -- Combined Net (Work + Leave + OT - Deductions - Already Paid)
        (
            COALESCE(calc.wp, 0) + 
            COALESCE(calc.lp_base, 0) + 
            COALESCE(calc.lp_housing, 0) + 
            COALESCE(vc.ot, 0) + COALESCE(vc.bonus, 0) - 
            (CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.115) ELSE 0 END) - 
            COALESCE(lp.already_paid_net, 0)
        ),
        -- Granular Earnings Breakdown (What you requested)
        COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
            FROM (
                SELECT 'Days Worked Pay (' || calc.wd || 'd)' as name, calc.wp as val WHERE calc.wd > 0
                UNION ALL
                SELECT 'Leave Base Pay (' || calc.ld || 'd)', calc.lp_base as val WHERE calc.ld > 0
                UNION ALL
                SELECT 'Leave Housing Pay', calc.lp_housing as val WHERE calc.ld > 0 AND calc.lp_housing > 0
                UNION ALL
                SELECT 'Overtime Amount', COALESCE(vc.ot, 0) WHERE COALESCE(vc.ot, 0) > 0
                UNION ALL
                SELECT 'Performance/Pool Bonus', COALESCE(vc.bonus, 0) WHERE COALESCE(vc.bonus, 0) > 0
            ) t WHERE val > 0
        ), '[]'::jsonb),
        -- Reductive Breakdown
        COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
            FROM (
                SELECT 'PIFSS Social Security' as name, (e.salary * 0.115) as val WHERE e.nationality = 'Kuwaiti'
                UNION ALL
                SELECT 'Previous Settlement Offset', lp.already_paid_net as val WHERE lp.already_paid_net > 0
            ) d WHERE val > 0
        ), '[]'::jsonb)

    FROM employees e
    -- Lateral for Allowances (Fixed 26-day Bridge)
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN (name ILIKE '%housing%') THEN (CASE WHEN type = 'Percentage' THEN (e.salary * value / 100) ELSE value END) ELSE 0 END) as h_sum,
            SUM(CASE WHEN type = 'Percentage' THEN (e.salary * value / 100) ELSE value END) as all_sum
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    -- Lateral for Variable Comp
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN comp_type = 'OVERTIME' THEN amount ELSE 0 END) as ot,
            SUM(CASE WHEN comp_type != 'OVERTIME' THEN amount ELSE 0 END) as bonus
        FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
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
    -- The Core Calculation Engine (Day-by-Day Precision)
    LEFT JOIN LATERAL (
        WITH days AS (
            SELECT 
                d::date as dt,
                lr.type as l_type,
                CASE WHEN lr.id IS NOT NULL THEN 'LEAVE' ELSE 'WORK' END as kind
            FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
            LEFT JOIN leave_requests lr ON lr.employee_id = e.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d >= lr.start_date AND d <= lr.end_date
            WHERE EXTRACT(DOW FROM d) != 5 -- Exclude Fridays
        ),
        ytd_sick AS (
            SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) as used
            FROM leave_requests 
            WHERE employee_id = e.id AND type = 'Sick' AND status IN ('Approved', 'Paid', 'HR_Finalized')
              AND start_date >= v_year_start AND start_date < v_month_start
        ),
        day_calc AS (
            SELECT 
                dt, kind, l_type,
                CASE WHEN l_type = 'Sick' THEN (SELECT used FROM ytd_sick) + (SELECT COUNT(*) FROM days d2 WHERE d2.l_type = 'Sick' AND d2.dt <= d1.dt) ELSE 0 END as s_ord
            FROM days d1
        )
        SELECT 
            COUNT(*) FILTER (WHERE kind = 'WORK') as wd,
            COUNT(*) FILTER (WHERE kind = 'LEAVE') as ld,
            (COUNT(*) FILTER (WHERE kind = 'WORK') * (e.salary + COALESCE(al.all_sum, 0)) / 26.0) as wp,
            SUM(CASE WHEN kind = 'LEAVE' THEN (e.salary / 26.0) * (CASE 
                WHEN l_type != 'Sick' THEN 1.0
                WHEN s_ord <= 15 THEN 1.0
                WHEN s_ord <= 25 THEN 0.75
                WHEN s_ord <= 35 THEN 0.50
                WHEN s_ord <= 45 THEN 0.25
                ELSE 0.0 END) ELSE 0 END) as lp_base,
            SUM(CASE WHEN kind = 'LEAVE' THEN (COALESCE(al.h_sum, 0) / 26.0) ELSE 0 END) as lp_housing
        FROM day_calc
    ) calc ON TRUE
    WHERE e.status = 'Active';

    -- 4. Finalize total disbursement
    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
