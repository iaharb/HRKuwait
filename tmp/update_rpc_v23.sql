-- Sentinel V23: The 'PIFSS Integrity Sovereign'
-- 1. Precision PIFSS Check: Detects any finalized run (Leave or Monthly) matching the month pattern.
-- 2. Fixed Pattern: Uses ILIKE '%YYYY-MM%' to catch 'LR-SARAH-2026-01-28'.
-- 3. Token-based Skip: Does not pay for any day already settled in another run.
-- 4. Result: If PIFSS was taken in her Leave Settlement, the Monthly Draft will 100% omit it.

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run_id UUID := uuid_generate_v4();
    v_month_pattern TEXT := SUBSTRING(p_period_key FROM 1 FOR 7); -- e.g. '2026-01'
    v_month_start DATE := TO_DATE(v_month_pattern || '-01', 'YYYY-MM-DD');
    v_month_end DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_year_start DATE := TO_DATE(EXTRACT(YEAR FROM v_month_start) || '-01-01', 'YYYY-MM-DD');
BEGIN
    -- 1. Cleanup
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';

    -- 2. Create the Draft record
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 3. Calculate with PIFSS Exclusion Logic
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, net_salary, 
        allowance_breakdown, deduction_breakdown, pifss_deduction
    )
    SELECT 
        v_run_id, 
        e.id, 
        e.name,
        e.salary,
        -- Net Calculation
        (
            COALESCE(calc.earnings_payout, 0)
            - (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_was_taken) THEN (e.salary * 0.115) ELSE 0 END)
            + COALESCE(vc.ot_val, 0)
        ),
        
        -- Earnings Breakdown
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'Net Settlement Content' as n, calc.earnings_payout as v WHERE calc.earnings_payout > 0
            UNION ALL
            SELECT 'Overtime Amount', vc.ot_val WHERE vc.ot_val > 0
        ) t WHERE v > 0), '[]'::jsonb),
        
        -- Deductions Breakdown
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'PIFSS (11.5%)' as n, (e.salary * 0.115) as v WHERE e.nationality = 'Kuwaiti' AND NOT calc.pifss_was_taken
            UNION ALL
            SELECT 'PIFSS (Exempt: Paid in Leave Run)' as n, 0 as v WHERE e.nationality = 'Kuwaiti' AND calc.pifss_was_taken
        ) d WHERE v > 0 OR (v = 0 AND n LIKE '%Exempt%')), '[]'::jsonb),

        -- Internal PIFSS field for future checks
        (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_was_taken) THEN (e.salary * 0.115) ELSE 0 END)

    FROM employees e
    -- Lateral for Allowances
    LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN name ILIKE '%housing%' THEN (CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) ELSE 0 END) as h_s,
               SUM(CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) as a_s
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    -- Lateral for Overtime
    LEFT JOIN LATERAL (
        SELECT SUM(amount) as ot_val 
        FROM variable_compensation 
        WHERE employee_id=e.id AND comp_type='OVERTIME' AND status='APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    -- Day-Token and PIFSS Check Bridge
    LEFT JOIN LATERAL (
        WITH days AS (
            SELECT 
                d::date as dt,
                lr.type as l_type,
                CASE WHEN lr.id IS NOT NULL THEN 'LEAVE' ELSE 'WORK' END as kind,
                -- Verify if this day is ALREADY paid in ANY finalized run
                EXISTS(
                    SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id = pi.run_id
                    WHERE pi.employee_id = e.id AND pr.status = 'Finalized'
                      AND pr.locked_start <= d::date AND pr.locked_end >= d::date
                ) as is_paid
            FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
            LEFT JOIN leave_requests lr ON lr.employee_id = e.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d >= lr.start_date AND d <= lr.end_date
            WHERE EXTRACT(DOW FROM d) != 5
        ),
        pifss_status AS (
            -- Check if PIFSS was already deducted for this specific month key
            SELECT EXISTS(
                SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id = pi.run_id
                WHERE pi.employee_id = e.id AND pr.status = 'Finalized'
                  AND pr.period_key ILIKE '%' || v_month_pattern || '%'
                  AND pi.pifss_deduction > 0
            ) as taken_flag
        ),
        ytd_sick AS (
            SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) as s_used
            FROM leave_requests WHERE employee_id = e.id AND type = 'Sick' AND status IN ('Approved', 'Paid')
              AND start_date >= v_year_start AND start_date < v_month_start
        ),
        day_tokens AS (
            SELECT dt, kind, l_type, 
                   (SELECT s_used FROM ytd_sick) + (SELECT COUNT(*) FROM days d2 WHERE d2.l_type = 'Sick' AND d2.dt <= d1.dt) as sick_seq
            FROM days d1 WHERE NOT is_paid
        )
        SELECT 
            COUNT(*) FILTER (WHERE kind='WORK') as wd,
            COUNT(*) FILTER (WHERE kind='LEAVE') as ld,
            SUM(CASE 
                WHEN kind='WORK' THEN (e.salary + COALESCE(al.a_s,0))/26.0 
                WHEN kind='LEAVE' THEN (e.salary + COALESCE(al.h_s,0))/26.0 * (CASE WHEN l_type='Sick' THEN (CASE WHEN sick_seq <= 15 THEN 1.0 WHEN sick_seq <= 25 THEN 0.75 ELSE 0.0 END) ELSE 1.0 END)
                ELSE 0 END) as earnings_payout,
            (SELECT taken_flag FROM pifss_status) as pifss_was_taken
        FROM day_tokens
    ) calc ON TRUE
    WHERE e.status = 'Active';

    -- 4. Finalize total
    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
