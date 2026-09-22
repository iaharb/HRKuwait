-- Sentinel V25: The 'Fiscal Integrity Sovereign'
-- 1. Precision Day-Token check to skip settled days.
-- 2. Granular breakdown: Days Worked, Leave Base, and Leave Housing.
-- 3. PIFSS De-duplication: Checks for previous deductions in current month.
-- 4. Employer Share Calculation: Now populates pifss_employer_share (12.5% per GL mapping).
-- 5. GL Ready: Ensures both deduction and employer cost are registered in payroll_items.

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
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, net_salary, 
        allowance_breakdown, deduction_breakdown, pifss_deduction, pifss_employer_share
    )
    SELECT 
        v_run_id, e.id, e.name, e.salary,
        -- Net Calculation (Employee side)
        (
            COALESCE(calc.wp, 0) + COALESCE(calc.lp_b, 0) + COALESCE(calc.lp_h, 0)
            - (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.115) ELSE 0 END)
            + COALESCE(vc.ot, 0)
        ),
        
        -- EARNINGS
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'Days Worked Pay (' || calc.wd || 'd)' as n, calc.wp as v WHERE calc.wd > 0
            UNION ALL
            SELECT 'Leave Base Pay (' || calc.ld || 'd)', calc.lp_b as v WHERE calc.ld > 0
            UNION ALL
            SELECT 'Leave Housing Pay', calc.lp_h as v WHERE calc.ld > 0 AND calc.lp_h > 0
            UNION ALL
            SELECT 'Overtime Amount', vc.ot as v WHERE vc.ot > 0
        ) t WHERE v > 0), '[]'::jsonb),
        
        -- DEDUCTIONS
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'PIFSS (11.5%)' as n, (e.salary * 0.115) as v WHERE e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid
            UNION ALL
            SELECT 'PIFSS (Exempt: Settled in Leave Run)', 0 as v WHERE e.nationality = 'Kuwaiti' AND calc.pifss_paid
        ) d WHERE v > 0 OR n LIKE '%Exempt%'), '[]'::jsonb),

        -- PIFSS Fields
        (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.115) ELSE 0 END), -- Employee share
        (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.125) ELSE 0 END)  -- Employer share (Added)

    FROM employees e
    LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN name ILIKE '%housing%' THEN (CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) ELSE 0 END) as h_s,
               SUM(CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) as a_s
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    LEFT JOIN LATERAL (
        SELECT SUM(amount) as ot FROM variable_compensation WHERE employee_id=e.id AND comp_type='OVERTIME' AND status='APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    LEFT JOIN LATERAL (
        WITH days AS (
            SELECT 
                d::date as dt, lr.type as l_type, CASE WHEN lr.id IS NOT NULL THEN 'LEAVE' ELSE 'WORK' END as kind,
                EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=e.id AND pr.status='Finalized' AND pr.locked_start <= d::date AND pr.locked_end >= d::date) as is_paid
            FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
            LEFT JOIN leave_requests lr ON lr.employee_id=e.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d >= lr.start_date AND d <= lr.end_date
            WHERE EXTRACT(DOW FROM d) != 5
        ),
        pifss_check AS (
            SELECT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id = pi.run_id WHERE pi.employee_id = e.id AND pr.status = 'Finalized' AND pr.period_key ILIKE '%' || v_month_pattern || '%' AND pi.pifss_deduction > 0) as paid_already
        ),
        ytd_sick AS (
            SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) as used FROM leave_requests WHERE employee_id = e.id AND type='Sick' AND status IN ('Approved','Paid') AND start_date >= v_year_start AND start_date < v_month_start
        ),
        active_days AS (
            SELECT dt, kind, l_type, 
                   (SELECT used FROM ytd_sick) + (SELECT COUNT(*) FROM days d2 WHERE d2.l_type='Sick' AND d2.dt <= d1.dt) as s_ord
            FROM days d1 WHERE NOT is_paid
        )
        SELECT 
            COUNT(*) FILTER (WHERE kind='WORK') as wd,
            COUNT(*) FILTER (WHERE kind='LEAVE') as ld,
            SUM(CASE WHEN kind='WORK' THEN (e.salary + COALESCE(al.a_s,0))/26.0 ELSE 0 END) as wp,
            SUM(CASE WHEN kind='LEAVE' THEN (e.salary/26.0) * (CASE WHEN l_type='Sick' THEN (CASE WHEN s_ord <= 15 THEN 1.0 WHEN s_ord <= 25 THEN 0.75 WHEN s_ord <= 35 THEN 0.50 WHEN s_ord <= 45 THEN 0.25 ELSE 0 END) ELSE 1.0 END) ELSE 0 END) as lp_b,
            SUM(CASE WHEN kind='LEAVE' THEN (COALESCE(al.h_s,0)/26.0) ELSE 0 END) as lp_h,
            (SELECT paid_already FROM pifss_check) as pifss_paid
        FROM active_days
    ) calc ON TRUE
    WHERE e.status = 'Active';

    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
