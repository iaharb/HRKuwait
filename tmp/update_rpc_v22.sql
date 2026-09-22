-- Sentinel V22: The 'Zero-Discrepancy Sovereign'
-- 1. Day-Token check: Skips any day already settled in a Finalized payroll run.
-- 2. PIFSS De-duplication: Only deducts PIFSS if it hasn't been settled in the month's Leave_Run.
-- 3. Transparent Breakdown: Only shows lines with values > 0.
-- 4. Net result for Sarah in Jan will be ONLY her Overtime (since salary/PIFSS are already paid).

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

    -- 2. Create Registry
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 3. Calculate with PIFSS Deduction checking
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, net_salary, 
        allowance_breakdown, deduction_breakdown
    )
    SELECT 
        v_run_id, e.id, e.name, e.salary,
        -- Final Net: Earnings - PIFSS(if applicable) + Overtime
        (
            COALESCE(calc.earnings, 0)
            - (CASE WHEN (e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid) THEN (e.salary * 0.115) ELSE 0 END)
            + COALESCE(vc.ot, 0)
        ),
        
        -- EARNINGS (Audit side)
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'Net Settlement Content (' || calc.wd || 'w/' || calc.ld || 'l)' as n, calc.earnings as v WHERE calc.earnings > 0
            UNION ALL
            SELECT 'Overtime Amount', vc.ot WHERE vc.ot > 0
        ) t WHERE v > 0), '[]'::jsonb),
        
        -- DEDUCTIONS (Audit side)
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name', n, 'value', v)) FROM (
            SELECT 'PIFSS (11.5%)' as n, (e.salary * 0.115) as v WHERE e.nationality = 'Kuwaiti' AND NOT calc.pifss_paid
            UNION ALL
            -- Note to clarify why it's zero
            SELECT 'PIFSS (Already Settled in Leave Run)', 0 as v WHERE e.nationality = 'Kuwaiti' AND calc.pifss_paid
        ) d WHERE v > 0 OR (v = 0 AND n LIKE '%Already Settled%')), '[]'::jsonb)

    FROM employees e
    -- Lateral for Allowances
    LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN name ILIKE '%housing%' THEN (CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) ELSE 0 END) as h_s,
               SUM(CASE WHEN type='Percentage' THEN e.salary*value/100 ELSE value END) as a_s
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    -- Lateral for Overtime
    LEFT JOIN LATERAL (
        SELECT SUM(amount) as ot 
        FROM variable_compensation 
        WHERE employee_id=e.id AND comp_type='OVERTIME' AND status='APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    -- Main Token Logical Bridge
    LEFT JOIN LATERAL (
        WITH days AS (
            SELECT d::date as dt, lr.type as l_type, CASE WHEN lr.id IS NOT NULL THEN 'LEAVE' ELSE 'WORK' END as kind,
                   EXISTS(
                     SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id 
                     WHERE pi.employee_id=e.id AND pr.status='Finalized' 
                       AND pr.locked_start <= d AND pr.locked_end >= d
                   ) as is_paid
            FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
            LEFT JOIN leave_requests lr ON lr.employee_id=e.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d >= lr.start_date AND d <= lr.end_date
            WHERE EXTRACT(DOW FROM d) != 5
        ),
        pifss_check AS (
            -- Check if PIFSS was already deducted in any finalized run for this MONTH
            SELECT EXISTS(
                SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id = pi.run_id
                WHERE pi.employee_id = e.id AND pr.status = 'Finalized'
                  AND pr.period_key LIKE SUBSTRING(p_period_key FROM 1 FOR 7) || '%'
                  AND pi.pifss_deduction > 0
            ) as already_deducted
        ),
        ytd_sick AS (SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) as used FROM leave_requests WHERE employee_id = e.id AND type = 'Sick' AND status IN ('Approved', 'Paid') AND start_date >= v_year_start AND start_date < v_month_start),
        day_calc AS (SELECT dt, kind, l_type, CASE WHEN l_type = 'Sick' THEN (SELECT used FROM ytd_sick) + (SELECT COUNT(*) FROM days d2 WHERE d2.l_type = 'Sick' AND d2.dt <= d1.dt) ELSE 0 END as s_ord FROM days d1 WHERE NOT is_paid)
        SELECT COUNT(*) FILTER (WHERE kind='WORK') as wd, COUNT(*) FILTER (WHERE kind='LEAVE') as ld,
               SUM(CASE 
                    WHEN kind='WORK' THEN (e.salary + COALESCE(al.a_s,0))/26.0 
                    WHEN kind='LEAVE' THEN (e.salary + COALESCE(al.h_s,0))/26.0 * (CASE WHEN l_type='Sick' THEN (CASE WHEN s_ord <= 15 THEN 1.0 WHEN s_ord <= 25 THEN 0.75 ELSE 0.0 END) ELSE 1.0 END)
                    ELSE 0 END) as earnings,
               (SELECT already_deducted FROM pifss_check) as pifss_paid
        FROM day_calc
    ) calc ON TRUE
    WHERE e.status = 'Active';

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
