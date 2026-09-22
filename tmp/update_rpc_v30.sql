-- Sentinel V30: The 'Scalar Supreme Sovereign'
-- 1. Resolved "aggregate functions not allowed" by removing complex LATERAL/CTE nesting.
-- 2. Uses strictly scalar subqueries in the main SELECT list for maximal compatibility.
-- 3. Maintained 26-Day Fixed Budget (February Logic): Pay = (26 - Leave - Settled) days.
-- 4. Maintained GL Integration (12.5% Employer Share).

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

    -- 3. The Core Engine (Using Scalar Subqueries)
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, net_salary, 
        allowance_breakdown, deduction_breakdown, pifss_deduction, pifss_employer_share
    )
    SELECT 
        v_run_id, e.id, e.name, e.salary,
        -- Net Calculation: (Work Pay + Leave Base + Leave Housing) - PIFSS + OT
        (
          COALESCE(calc.wp, 0) + COALESCE(calc.lp_b, 0) + COALESCE(calc.lp_h, 0)
          - (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.115) ELSE 0 END)
          + COALESCE(vc.ot_val, 0)
        ),
        
        -- EARNINGS BREAKDOWN
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'Days Worked Pay (' || calc.wd_final || 'd of 26)' as n, calc.wp as v WHERE calc.wd_final > 0
            UNION ALL
            SELECT 'Leave Base Pay (' || calc.ld_active || 'd)', calc.lp_b as v WHERE calc.ld_active > 0
            UNION ALL
            SELECT 'Leave Housing Pay', calc.lp_h as v WHERE calc.ld_active > 0 AND calc.lp_h > 0
            UNION ALL
            SELECT 'Overtime Amount', vc.ot_val as v WHERE vc.ot_val > 0
        ) t WHERE v > 0), '[]'::jsonb),
        
        -- DEDUCTIONS BREAKDOWN
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'PIFSS Employee Share (11.5%)' as n, (e.salary * 0.115) as v WHERE e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid
            UNION ALL
            SELECT 'PIFSS (Already Paid in Leave Run)' as n, 0 as v WHERE e.nationality = 'Kuwaiti' AND calc.pifss_paid
            UNION ALL
            SELECT 'Settled in Previous Run (' || calc.settled_days || 'd)', 0 as v WHERE calc.settled_days > 0
        ) d WHERE v > 0 OR (v = 0 AND (n LIKE '%Settled%' OR n LIKE '%Paid%'))), '[]'::jsonb),

        -- PIFSS Data Columns (GL Ready)
        (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.115) ELSE 0 END),
        (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.125) ELSE 0 END)

    FROM employees e
    -- Standard Allowances
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN name ILIKE '%housing%' THEN (CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) ELSE 0 END) as h_s,
            SUM(CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) as a_s
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    -- Overtime
    LEFT JOIN LATERAL (
        SELECT SUM(amount) as ot_val 
        FROM variable_compensation 
        WHERE employee_id=e.id AND comp_type='OVERTIME' AND status='APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    -- Scalar Calculation Node
    LEFT JOIN LATERAL (
        SELECT 
            -- Counts
            ld_active, settled_days, 
            GREATEST(0, 26 - (ld_active + settled_days)) as wd_final,
            (GREATEST(0, 26 - (ld_active + settled_days)) * (e.salary + COALESCE(al.a_s, 0)) / 26.0) as wp,
            -- Leave Sums (Calculated independently to avoid aggregate-in-from error)
            lp_b, lp_h, pifss_paid
        FROM (
            SELECT 
                (SELECT COUNT(*) FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d 
                 WHERE EXTRACT(DOW FROM d) != 5 
                 AND EXISTS(SELECT 1 FROM leave_requests lr WHERE lr.employee_id = e.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d::date BETWEEN lr.start_date AND lr.end_date)
                 AND NOT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=e.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end)
                ) as ld_active,
                (SELECT COUNT(*) FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d 
                 WHERE EXTRACT(DOW FROM d) != 5 
                 AND EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=e.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end)
                ) as settled_days,
                -- Leave Cash
                COALESCE((
                    SELECT SUM((e.salary / 26.0) * CASE 
                        WHEN lType = 'Sick' THEN 
                            CASE 
                                WHEN (SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) FROM leave_requests WHERE employee_id = e.id AND type = 'Sick' AND status IN ('Approved', 'Paid') AND start_date >= v_year_start AND start_date < v_month_start) 
                                   + (SELECT COUNT(*) FROM generate_series(v_month_start, d_inner, '1 day'::interval) d2 LEFT JOIN leave_requests lr2 ON lr2.employee_id=e.id AND lr2.status IN ('Approved','Paid') AND d2::date BETWEEN lr2.start_date AND lr2.end_date WHERE EXTRACT(DOW FROM d2) != 5 AND lr2.type='Sick') <= 15 THEN 1.0
                                WHEN (SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) FROM leave_requests WHERE employee_id = e.id AND type = 'Sick' AND status IN ('Approved', 'Paid') AND start_date >= v_year_start AND start_date < v_month_start) 
                                   + (SELECT COUNT(*) FROM generate_series(v_month_start, d_inner, '1 day'::interval) d2 LEFT JOIN leave_requests lr2 ON lr2.employee_id=e.id AND lr2.status IN ('Approved','Paid') AND d2::date BETWEEN lr2.start_date AND lr2.end_date WHERE EXTRACT(DOW FROM d2) != 5 AND lr2.type='Sick') <= 25 THEN 0.75
                                ELSE 0.0 END
                        ELSE 1.0 END)
                    FROM (
                        SELECT d_inner::date as d_inner, lr_inner.type as lType
                        FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d_inner
                        JOIN leave_requests lr_inner ON lr_inner.employee_id = e.id AND lr_inner.status IN ('Approved','Paid','HR_Finalized') AND d_inner::date BETWEEN lr_inner.start_date AND lr_inner.end_date
                        WHERE EXTRACT(DOW FROM d_inner) != 5
                        AND NOT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=e.id AND pr.status='Finalized' AND d_inner::date BETWEEN pr.locked_start AND pr.locked_end)
                    ) sub
                ), 0) as lp_b,
                COALESCE((
                    SELECT SUM(COALESCE(al.h_s, 0) / 26.0)
                    FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d_h
                    JOIN leave_requests lr_h ON lr_h.employee_id = e.id AND lr_h.status IN ('Approved','Paid','HR_Finalized') AND d_h::date BETWEEN lr_h.start_date AND lr_h.end_date
                    WHERE EXTRACT(DOW FROM d_h) != 5
                    AND NOT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=e.id AND pr.status='Finalized' AND d_h::date BETWEEN pr.locked_start AND pr.locked_end)
                ), 0) as lp_h,
                -- PIFSS Shield
                EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id = pi.run_id WHERE pi.employee_id = e.id AND pr.status = 'Finalized' AND pr.period_key ILIKE '%' || v_month_pattern || '%' AND pi.pifss_deduction > 0) as pifss_paid
        ) sub_calc
    ) calc ON TRUE
    WHERE e.status = 'Active';

    -- Update Run Total
    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
