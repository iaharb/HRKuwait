-- Sentinel V28: The 'Syntactic Supreme Sovereign'
-- 1. Fixed SQL aggregation error by flattening CTE dependencies.
-- 2. Maintained 26-Day Fixed Budget logic (February Fix).
-- 3. Maintthat ained GL Integration (12.5% Employer Share).
-- 4. Maintained Detailed Audits.

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run_id UUID := uuid_generate_v4();
    v_month_pattern TEXT := SUBSTRING(p_period_key FROM 1 FOR 7); 
    v_month_start DATE := TO_DATE(v_month_pattern || '-01', 'YYYY-MM-DD');
    v_month_end DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_year_start DATE := TO_DATE(EXTRACT(YEAR FROM v_month_start) || '-01-01', 'YYYY-MM-DD');
BEGIN
    -- 1. Cleanup
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';

    -- 2. Create the Draft record
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 3. The Core Engine
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, net_salary, 
        allowance_breakdown, deduction_breakdown, pifss_deduction, pifss_employer_share
    )
    SELECT 
        v_run_id, 
        e.id, 
        e.name,
        e.salary,
        -- Net Calculation
        (
            COALESCE(calc.wp, 0) + COALESCE(calc.lp_b, 0) + COALESCE(calc.lp_h, 0)
            - (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.115) ELSE 0 END)
            + COALESCE(vc.ot_val, 0)
        ),
        
        -- Granular Earnings Breakdown
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'Days Worked Pay (' || calc.wd_final || 'd of 26)' as n, calc.wp as v WHERE calc.wd_final > 0
            UNION ALL
            SELECT 'Leave Base Pay (' || calc.ld_active || 'd)', calc.lp_b as v WHERE calc.ld_active > 0
            UNION ALL
            SELECT 'Leave Housing Pay', calc.lp_h as v WHERE calc.ld_active > 0 AND calc.lp_h > 0
            UNION ALL
            SELECT 'Overtime Amount', vc.ot_val as v WHERE vc.ot_val > 0
        ) t WHERE v > 0), '[]'::jsonb),
        
        -- Granular Deductions Breakdown
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'PIFSS Employee Share (11.5%)' as n, (e.salary * 0.115) as v WHERE e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid
            UNION ALL
            SELECT 'PIFSS (Already Paid in Leave Run)' as n, 0 as v WHERE e.nationality = 'Kuwaiti' AND calc.pifss_paid
            UNION ALL
            SELECT 'Settled in Previous Run (' || calc.settled_days || 'd)', 0 as v WHERE calc.settled_days > 0
        ) d WHERE v > 0 OR (v = 0 AND (n LIKE '%Settled%' OR n LIKE '%Paid in Leave%'))), '[]'::jsonb),

        -- PIFSS Data Columns (GL Ready)
        (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.115) ELSE 0 END),
        (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.125) ELSE 0 END)

    FROM employees e
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN name ILIKE '%housing%' THEN (CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) ELSE 0 END) as h_s,
            SUM(CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) as a_s
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    LEFT JOIN LATERAL (
        SELECT SUM(amount) as ot_val 
        FROM variable_compensation 
        WHERE employee_id=e.id AND comp_type='OVERTIME' AND status='APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    LEFT JOIN LATERAL (
        WITH days AS (
            SELECT d::date as dt, lr.type as l_type, CASE WHEN lr.id IS NOT NULL THEN 'LEAVE' ELSE 'WORK' END as kind,
                   EXISTS(
                       SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id = pi.run_id
                       WHERE pi.employee_id = e.id AND pr.status = 'Finalized'
                         AND pr.locked_start <= d::date AND pr.locked_end >= d::date
                   ) as is_paid
            FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
            LEFT JOIN leave_requests lr ON lr.employee_id = e.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d >= lr.start_date AND d <= lr.end_date
            WHERE EXTRACT(DOW FROM d) != 5
        ),
        ytd_sick AS (
            SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) as s_used
            FROM leave_requests WHERE employee_id = e.id AND type = 'Sick' AND status IN ('Approved', 'Paid')
              AND start_date >= v_year_start AND start_date < v_month_start
        ),
        stats AS (
            SELECT 
                COUNT(*) FILTER (WHERE kind='LEAVE' AND NOT is_paid) as ld_count,
                COUNT(*) FILTER (WHERE is_paid) as s_count
            FROM days
        ),
        leave_math AS (
            SELECT 
                COALESCE(SUM((e.salary / 26.0) * CASE WHEN d.l_type = 'Sick' THEN 
                        CASE 
                            WHEN (SELECT s_used FROM ytd_sick) + (SELECT COUNT(*) FROM days d2 WHERE d2.l_type = 'Sick' AND d2.dt <= d.dt) <= 15 THEN 1.0
                            WHEN (SELECT s_used FROM ytd_sick) + (SELECT COUNT(*) FROM days d2 WHERE d2.l_type = 'Sick' AND d2.dt <= d.dt) <= 25 THEN 0.75
                            WHEN (SELECT s_used FROM ytd_sick) + (SELECT COUNT(*) FROM days d2 WHERE d2.l_type = 'Sick' AND d2.dt <= d.dt) <= 35 THEN 0.50
                            WHEN (SELECT s_used FROM ytd_sick) + (SELECT COUNT(*) FROM days d2 WHERE d2.l_type = 'Sick' AND d2.dt <= d.dt) <= 45 THEN 0.25
                            ELSE 0.0 
                        END
                    ELSE 1.0 END), 0) as b_pay,
                COALESCE(SUM(COALESCE(al.h_s, 0) / 26.0), 0) as h_pay
            FROM days d WHERE d.kind = 'LEAVE' AND NOT d.is_paid
        )
        SELECT 
            st.ld_count as ld_active,
            st.s_count as settled_days,
            GREATEST(0, 26 - (st.ld_count + st.s_count)) as wd_final,
            (GREATEST(0, 26 - (st.ld_count + st.s_count)) * (e.salary + COALESCE(al.a_s, 0)) / 26.0) as wp,
            lm.b_pay as lp_b,
            lm.h_pay as lp_h,
            EXISTS(
                SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id = pi.run_id
                WHERE pi.employee_id = e.id AND pr.status = 'Finalized'
                  AND pr.period_key ILIKE '%' || v_month_pattern || '%'
                  AND pi.pifss_deduction > 0
            ) as pifss_paid
        FROM stats st, leave_math lm
    ) calc ON TRUE
    WHERE e.status = 'Active';

    -- Finalize Total Disbursement
    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
