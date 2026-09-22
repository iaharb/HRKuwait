-- Sentinel V18: The 'Precision Pivot'
-- 1. Returns { "id": UUID } to match Frontend expectations.
-- 2. Fixed 'column ytd does not exist' by using explicit alias.
-- 3. Implements 26-day rule: (Base + Hub Allowances) for work, (Base + Housing) for leave.
-- 4. Handles already-paid Leave Runs to avoid double disbursement.

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
    -- Cleanup
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';

    -- Create Run
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- Calculate Items
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, housing_allowance, 
        other_allowances, net_salary, allowance_breakdown, deduction_breakdown
    )
    SELECT 
        v_run_id, e.id, e.name, e.salary, COALESCE(al.h_sum, 0), COALESCE(al.o_sum, 0),
        -- Formula: (Work Pay) + (Leave Pay) + (OT & Bonuses) - (PIFSS) - (Already Paid settlements)
        (
            COALESCE(calc.work_pay_val, 0)
            + COALESCE(calc.leave_pay_val, 0)
            + COALESCE(vc.ot, 0) + COALESCE(vc.bonus, 0)
            - (CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.115) ELSE 0 END)
            - COALESCE(lp.already_paid_net, 0)
        ),
        -- Breakdown for Audit clarity
        jsonb_build_array(
            jsonb_build_object('name', 'Prorated Salary (' || (calc.month_biz_days - calc.leave_biz_days) || 'w/' || calc.leave_biz_days || 'l)', COALESCE(calc.work_pay_val, 0) + COALESCE(calc.leave_pay_val, 0))
        ) || 
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', comp_type, 'value', val)) FROM (
            SELECT 'Overtime' as comp_type, vc.ot as val WHERE vc.ot > 0
            UNION ALL
            SELECT 'Bonuses', vc.bonus WHERE vc.bonus > 0
        ) q), '[]'::jsonb),
        -- Deductions
        jsonb_build_array(
            jsonb_build_object('name', 'PIFSS Social Security', 'value', (CASE WHEN e.nationality = 'Kuwaiti' THEN e.salary * 0.115 ELSE 0 END))
        ) ||
        CASE WHEN lp.already_paid_net > 0 THEN jsonb_build_array(jsonb_build_object('name', 'Leave Settlement Offset', 'value', lp.already_paid_net)) ELSE '[]'::jsonb END
    FROM employees e
    -- Allowances: Define what stays during leave (Housing) vs what drops (Others)
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN (name ILIKE '%housing%') THEN (CASE WHEN type = 'Percentage' THEN (e.salary * value / 100) ELSE value END) ELSE 0 END) as h_sum,
            SUM(CASE WHEN (name NOT ILIKE '%housing%') THEN (CASE WHEN type = 'Percentage' THEN (e.salary * value / 100) ELSE value END) ELSE 0 END) as o_sum
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    -- Variable Comp
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN comp_type = 'OVERTIME' THEN amount ELSE 0 END) as ot,
            SUM(CASE WHEN comp_type != 'OVERTIME' THEN amount ELSE 0 END) as bonus
        FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    -- Settlement logic: Deduct what was already paid in Leave Runs this month
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pi.net_salary), 0) as already_paid_net
        FROM payroll_runs pr
        JOIN payroll_items pi ON pr.id = pi.run_id
        WHERE pi.employee_id = e.id 
          AND pr.period_key LIKE SUBSTRING(p_period_key FROM 1 FOR 7) || '%'
          AND pr.cycle_type = 'Leave_Run' AND pr.status = 'Finalized'
    ) lp ON TRUE
    -- Main Math: The 26-day Bridge
    LEFT JOIN LATERAL (
        WITH stats AS (
            SELECT 
                fn_count_working_days(v_month_start, v_month_end) as m_days,
                COALESCE(SUM(fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date))), 0) as l_days
            FROM leave_requests lr 
            WHERE lr.employee_id = e.id AND lr.status IN ('Approved', 'Paid', 'HR_Finalized')
              AND lr.start_date <= v_month_end AND lr.end_date >= v_month_start
        ),
        ytd AS (
            SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) as used
            FROM leave_requests WHERE employee_id = e.id AND type = 'Sick' AND status IN ('Approved', 'Paid')
              AND start_date >= v_year_start AND start_date < v_month_start
        ),
        sick_details AS (
            -- Calculate specific sick pay factor if sick exists this month
            SELECT SUM(CASE 
                WHEN (ytd.used + i) <= 15 THEN 1.0
                WHEN (ytd.used + i) <= 25 THEN 0.75
                WHEN (ytd.used + i) <= 35 THEN 0.50
                WHEN (ytd.used + i) <= 45 THEN 0.25
                ELSE 0.0 END) / NULLIF(COALESCE((SELECT SUM(fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date))) FROM leave_requests lr WHERE lr.employee_id = e.id AND lr.type = 'Sick' AND lr.status IN ('Approved','Paid') AND lr.start_date <= v_month_end AND lr.end_date >= v_month_start),0),0) as s_factor
            FROM ytd, generate_series(1, (SELECT COALESCE(SUM(fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date))), 0) FROM leave_requests lr WHERE lr.employee_id = e.id AND lr.type = 'Sick' AND lr.status IN ('Approved','Paid') AND lr.start_date <= v_month_end AND lr.end_date >= v_month_start)) i
        )
        SELECT 
            s.m_days as month_biz_days,
            s.l_days as leave_biz_days,
            -- Work Pay = (Monthly Biz Days - Leave Biz Days) * (Total Gross / 26)
            ( (s.m_days - s.l_days) * (e.salary + COALESCE(al.h_sum,0) + COALESCE(al.o_sum,0)) / 26.0 ) as work_pay_val,
            -- Leave Pay = Leave Biz Days * (Base + Housing) / 26 * s_factor
            ( s.l_days * (e.salary + COALESCE(al.h_sum,0)) / 26.0 * COALESCE((SELECT s_factor FROM sick_details), 1.0) ) as leave_pay_val
        FROM stats s
    ) calc ON TRUE
    WHERE e.status = 'Active';

    -- Finalize totals for run record
    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id)
    WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
