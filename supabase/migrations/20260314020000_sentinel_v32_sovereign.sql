-- Sentinel V32 Sovereign: The Locked Final Standard
-- --------------------------------------------------------------------------------
-- 1. PROCEDURAL STABILITY: Uses a PL/pgSQL loop to avoid Postgres parser limits.
-- 2. 26-DAY FIXED BUDGET: Monthly pay = (26 - LeaveDays - SettledDays - PreHireDays) * Rate.
-- 3. SICK LEAVE SEGMENTS: 15d @ 100%, 10d @ 75%, 10d @ 50%, 10d @ 25% (Kuwaiti Labor Law).
-- 4. SARAH PROTECTION: Uses 'is_paid' token to skip days settled in Leave Runs.
-- 5. PIFSS GL INTEGRATION: Calculates 11.5% Emp share and 12.5% Co share for Finance mapping.
-- 6. ONBOARDING PROTECTION: Excludes future hires; pro-rates mid-month hires.
-- 7. DETAILED AUDIT: Every execution shows granular Work/Leave/Housing splits.
-- --------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_run_id UUID := uuid_generate_v4();
    v_month_pattern TEXT := SUBSTRING(p_period_key FROM 1 FOR 7); 
    v_month_start DATE := TO_DATE(v_month_pattern || '-01', 'YYYY-MM-DD');
    v_month_end DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_year_start DATE := TO_DATE(EXTRACT(YEAR FROM v_month_start) || '-01-01', 'YYYY-MM-DD');
    r RECORD; -- Employee iterator
    -- Calculation Variables
    v_ld_count INT; v_s_count INT; v_pre_hire_count INT;
    v_wd_final INT; v_wp NUMERIC; v_lp_b NUMERIC; v_lp_h NUMERIC;
    v_pifss_paid BOOLEAN; v_housing_rate NUMERIC; v_allowance_total NUMERIC;
    v_ot_val NUMERIC; v_ytd_sick_used INT;
BEGIN
    -- 1. Global Cleanup & Run Initialization
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 2. Processing Engine
    FOR r IN 
        SELECT * FROM employees 
        WHERE status = 'Active' 
        AND (join_date IS NULL OR join_date <= v_month_end)
    LOOP
        -- A. Fetch Rate Context (Housing vs Total)
        SELECT 
            COALESCE(SUM(CASE WHEN name ILIKE '%housing%' THEN (CASE WHEN type='Percentage' THEN r.salary*value/100 ELSE value END) ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type='Percentage' THEN r.salary*value/100 ELSE value END), 0)
        INTO v_housing_rate, v_allowance_total
        FROM employee_allowances WHERE employee_id = r.id;

        -- B. Fetch Variable Context (Overtime)
        SELECT COALESCE(SUM(amount), 0) INTO v_ot_val 
        FROM variable_compensation 
        WHERE employee_id=r.id AND comp_type='OVERTIME' AND status='APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL;

        -- C. PIFSS Logic: Shield against double-deduction
        SELECT EXISTS(
            SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id 
            WHERE pi.employee_id=r.id AND pr.status='Finalized' AND pr.period_key ILIKE '%' || v_month_pattern || '%' AND pi.pifss_deduction > 0
        ) INTO v_pifss_paid;

        -- D. Count Day Tokens
        -- ld_count: Actual Leave days in this month not yet paid
        -- s_count: Days in this month already finalized in another run (e.g. Leave Run)
        -- pre_hire: Days in this month calendar before the employee joined
        SELECT 
            COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM leave_requests lr WHERE lr.employee_id=r.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d::date BETWEEN lr.start_date AND lr.end_date) AND NOT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end)),
            COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end)),
            COUNT(*) FILTER (WHERE d::date < COALESCE(r.join_date, v_month_start))
        INTO v_ld_count, v_s_count, v_pre_hire_count
        FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
        WHERE EXTRACT(DOW FROM d) != 5;

        -- E. Sovereign Calculation (The 26-Day Budget)
        v_wd_final := GREATEST(0, 26 - (v_ld_count + v_s_count + v_pre_hire_count));
        v_wp := (v_wd_final * (r.salary + v_allowance_total) / 26.0);
        
        -- F. Robust Sick Leave Segment Calculation
        SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) INTO v_ytd_sick_used
        FROM leave_requests WHERE employee_id = r.id AND type='Sick' AND status IN ('Approved','Paid') AND start_date >= v_year_start AND start_date < v_month_start;

        SELECT COALESCE(SUM(
            (r.salary / 26.0) * 
            CASE 
                WHEN lr.type = 'Sick' THEN 
                    CASE 
                        WHEN (v_ytd_sick_used + (SELECT COUNT(*) FROM generate_series(v_month_start, d_inner::date, '1 day'::interval) d_chk LEFT JOIN leave_requests lr2 ON lr2.employee_id=r.id AND lr2.status IN ('Approved','Paid') AND d_chk::date BETWEEN lr2.start_date AND lr2.end_date WHERE EXTRACT(DOW FROM d_chk) != 5 AND lr2.type='Sick')) <= 15 THEN 1.0
                        WHEN (v_ytd_sick_used + (SELECT COUNT(*) FROM generate_series(v_month_start, d_inner::date, '1 day'::interval) d_chk LEFT JOIN leave_requests lr2 ON lr2.employee_id=r.id AND lr2.status IN ('Approved','Paid') AND d_chk::date BETWEEN lr2.start_date AND lr2.end_date WHERE EXTRACT(DOW FROM d_chk) != 5 AND lr2.type='Sick')) <= 25 THEN 0.75
                        WHEN (v_ytd_sick_used + (SELECT COUNT(*) FROM generate_series(v_month_start, d_inner::date, '1 day'::interval) d_chk LEFT JOIN leave_requests lr2 ON lr2.employee_id=r.id AND lr2.status IN ('Approved','Paid') AND d_chk::date BETWEEN lr2.start_date AND lr2.end_date WHERE EXTRACT(DOW FROM d_chk) != 5 AND lr2.type='Sick')) <= 35 THEN 0.50
                        WHEN (v_ytd_sick_used + (SELECT COUNT(*) FROM generate_series(v_month_start, d_inner::date, '1 day'::interval) d_chk LEFT JOIN leave_requests lr2 ON lr2.employee_id=r.id AND lr2.status IN ('Approved','Paid') AND d_chk::date BETWEEN lr2.start_date AND lr2.end_date WHERE EXTRACT(DOW FROM d_chk) != 5 AND lr2.type='Sick')) <= 45 THEN 0.25
                        ELSE 0 END
                ELSE 1.0 END
        ), 0) INTO v_lp_b
        FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d_inner
        JOIN leave_requests lr ON lr.employee_id = r.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d_inner::date BETWEEN lr.start_date AND lr.end_date
        WHERE EXTRACT(DOW FROM d_inner) != 5
        AND d_inner::date >= COALESCE(r.join_date, v_month_start)
        AND NOT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d_inner::date BETWEEN pr.locked_start AND pr.locked_end);

        v_lp_h := (v_ld_count * v_housing_rate / 26.0);

        -- G. Final Insertion
        INSERT INTO payroll_items (
            run_id, employee_id, employee_name, basic_salary, net_salary, 
            allowance_breakdown, deduction_breakdown, pifss_deduction, pifss_employer_share
        ) VALUES (
            v_run_id, r.id, r.name, r.salary,
            (v_wp + v_lp_b + v_lp_h + v_ot_val - (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END)),
            -- Allowance Breakdown
            jsonb_build_array(
                jsonb_build_object('name', 'Days Worked Pay (' || v_wd_final || 'd of 26)', 'value', v_wp),
                jsonb_build_object('name', 'Leave Base Pay (' || v_ld_count || 'd)', 'value', v_lp_b),
                jsonb_build_object('name', 'Leave Housing Pay', 'value', v_lp_h),
                jsonb_build_object('name', 'Overtime Amount', 'value', v_ot_val)
            ),
            -- Deduction Breakdown
            jsonb_build_array(
                jsonb_build_object('name', 'PIFSS Employee Share (11.5%)', 'value', (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END)),
                jsonb_build_object('name', 'Adjustments (Settled/Pre-Hire/Leave Skip)', 'value', 0)
            ),
            (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END),
            (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.125) ELSE 0 END)
        );
    END LOOP;

    -- 3. Finalize
    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
