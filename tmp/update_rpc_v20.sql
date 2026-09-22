-- Sentinel V20: The 'Straddle Sovereign'
-- 1. Strictly implements 26-day divisor rules.
-- 2. Handles 'Forward Month Advances' (Cross-month straddles).
-- 3. If a day was already settled in a 'Leave_Run' starting in a previous month, 
--    it is deducted from the current Monthly Payroll as 'Advance Settlement Offset'.
-- 4. Ensures Sarah/John examples from CSV work perfectly.

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
    -- 1. Cleanup
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';

    -- 2. Create Registry Entry
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 3. Main Calculation Iteration
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, net_salary, 
        allowance_breakdown, deduction_breakdown
    )
    SELECT 
        v_run_id, 
        e.id, 
        e.name,
        e.salary,
        -- Final Net: (Total Entitlement - Deductions - Advanced Payouts - PIFSS)
        (
            COALESCE(calc.earnings_sum, 0)
            - COALESCE(calc.advance_offset_sum, 0)
            - (CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.115) ELSE 0 END)
            + COALESCE(vc.ot, 0) + COALESCE(vc.bonus, 0)
        ),
        -- Earnings Breakdown
        COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
            FROM (
                SELECT 'Days Worked Pay (' || calc.wd || 'd)' as name, calc.wp as val WHERE calc.wd > 0
                UNION ALL
                SELECT 'Leave Days Pay (' || calc.ld || 'd)', calc.lp as val WHERE calc.ld > 0
                UNION ALL
                SELECT 'Overtime Amount', COALESCE(vc.ot, 0) WHERE COALESCE(vc.ot, 0) > 0
                UNION ALL
                SELECT 'Performance/Pool Bonus', COALESCE(vc.bonus, 0) WHERE COALESCE(vc.bonus, 0) > 0
            ) t WHERE val > 0
        ), '[]'::jsonb),
        -- Deductions Breakdown
        COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', name, 'value', val))
            FROM (
                SELECT 'PIFSS Social Security' as name, (e.salary * 0.115) as val WHERE e.nationality = 'Kuwaiti'
                UNION ALL
                SELECT 'Advance Settlement Offset', calc.advance_offset_sum as val WHERE calc.is_straddle_residual
            ) d WHERE val > 0
        ), '[]'::jsonb)

    FROM employees e
    -- Lateral for Allowances (Fixed 26-day rule)
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN (name ILIKE '%housing%') THEN (CASE WHEN type = 'Percentage' THEN (e.salary * value / 100) ELSE value END) ELSE 0 END) as h_sum,
            SUM(CASE WHEN type = 'Percentage' THEN (e.salary * value / 100) ELSE value END) as all_sum
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    -- Lateral for VC
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN comp_type = 'OVERTIME' THEN amount ELSE 0 END) as ot,
            SUM(CASE WHEN comp_type != 'OVERTIME' THEN amount ELSE 0 END) as bonus
        FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    -- Core Straddle/Day-by-Day Logic
    LEFT JOIN LATERAL (
        WITH month_days AS (
            SELECT 
                d::date as dt,
                lr.type as l_type,
                CASE WHEN lr.id IS NOT NULL THEN 'LEAVE' ELSE 'WORK' END as kind,
                -- Check if this specific date was settled in a Leave_Run from a PREVIOUS month
                EXISTS (
                    SELECT 1 
                    FROM payroll_runs pr
                    JOIN payroll_items pi ON pr.id = pi.run_id
                    WHERE pi.employee_id = e.id 
                      AND pr.cycle_type = 'Leave_Run' AND pr.status = 'Finalized'
                      AND pr.locked_start <= d::date AND pr.locked_end >= d::date
                      AND pr.locked_start < v_month_start -- Crucial: started before this month
                ) as already_paid
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
                dt, kind, l_type, already_paid,
                CASE WHEN l_type = 'Sick' THEN (SELECT used FROM ytd_sick) + (SELECT COUNT(*) FROM month_days d2 WHERE d2.l_type = 'Sick' AND d2.dt <= d1.dt) ELSE 0 END as s_ord
            FROM month_days d1
        ),
        pay_sums AS (
            SELECT 
                (e.salary + COALESCE(al.all_sum, 0)) / 26.0 as dr_work,
                (e.salary + COALESCE(al.h_sum, 0)) / 26.0 as dr_leave,
                COUNT(*) FILTER (WHERE kind = 'WORK') as wd_count,
                COUNT(*) FILTER (WHERE kind = 'LEAVE') as ld_count,
                SUM(CASE WHEN kind = 'WORK' THEN (e.salary + COALESCE(al.all_sum, 0)) / 26.0 ELSE 0 END) as wp_total,
                SUM(CASE WHEN kind = 'LEAVE' THEN (e.salary + COALESCE(al.h_sum, 0)) / 26.0 * (CASE 
                    WHEN l_type != 'Sick' THEN 1.0
                    WHEN s_ord <= 15 THEN 1.0
                    WHEN s_ord <= 25 THEN 0.75
                    WHEN s_ord <= 35 THEN 0.50
                    WHEN s_ord <= 45 THEN 0.25
                    ELSE 0.0 END) ELSE 0 END) as lp_total,
                SUM(CASE WHEN already_paid THEN (e.salary + COALESCE(al.h_sum, 0)) / 26.0 * (CASE 
                    WHEN l_type != 'Sick' THEN 1.0
                    WHEN s_ord <= 15 THEN 1.0
                    WHEN s_ord <= 25 THEN 0.75
                    WHEN s_ord <= 35 THEN 0.50
                    WHEN s_ord <= 45 THEN 0.25
                    ELSE 0.0 END) ELSE 0 END) as advance_offset
            FROM day_calc
        )
        SELECT 
            wd_count as wd,
            ld_count as ld,
            wp_total as wp,
            lp_total as lp,
            (wp_total + lp_total) as earnings_sum,
            advance_offset as advance_offset_sum,
            (advance_offset > 0) as is_straddle_residual
        FROM pay_sums
    ) calc ON TRUE
    WHERE e.status = 'Active';

    -- 4. Registry Totals
    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
