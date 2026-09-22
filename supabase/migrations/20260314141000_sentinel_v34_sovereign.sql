-- Sentinel V34 Sovereign: The Calibration Constant
-- --------------------------------------------------------------------------------
-- 1. CALIBRATED BUDGET: Solves the "February Dividend" bug. 
--    Maps calendar days in any month (24d, 25d, or 27d) to the fixed 26-day budget.
--    Factor = (26.0 / Total Working Days in calendar month).
-- 2. UNIT-BASED PRO-RATION: Deducts Settled/Leave/Pre-hire units based on the factor,
--    ensuring a full-month settlement (like Faisal's Feb) results in 0 net pay.
-- 3. OVERTIME CUTOFF: Maintains the 25th-day rule for variable compensation.
-- 4. ALL PREVIOUS SOVEREIGN RULES: 12.5% PIFSS, Sick Segments, etc.
-- --------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_run_id UUID := uuid_generate_v4();
    v_month_pattern TEXT := SUBSTRING(p_period_key FROM 1 FOR 7); 
    v_month_start DATE := TO_DATE(v_month_pattern || '-01', 'YYYY-MM-DD');
    v_month_end DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_cutoff_date DATE := (v_month_start + INTERVAL '24 days')::DATE; -- 25th day cutoff
    v_year_start DATE := TO_DATE(EXTRACT(YEAR FROM v_month_start) || '-01-01', 'YYYY-MM-DD');
    
    -- Calibration Variables
    v_cal_total_working_days INT;
    v_cal_factor NUMERIC; -- (26.0 / calendar working days)
    
    r RECORD;
    v_ld_count INT; v_s_count INT; v_pre_hire_count INT;
    v_wd_units NUMERIC; v_wp NUMERIC; v_lp_b NUMERIC; v_lp_h NUMERIC;
    v_pifss_paid BOOLEAN; v_housing_rate NUMERIC; v_allowance_total NUMERIC;
    v_ot_val NUMERIC; v_bonus_val NUMERIC; v_ytd_sick_used INT;
BEGIN
    -- 0. Calibrate the Month (Feb logic)
    SELECT COUNT(*) INTO v_cal_total_working_days
    FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
    WHERE EXTRACT(DOW FROM d) != 5;
    
    v_cal_factor := 26.0 / NULLIF(v_cal_total_working_days, 0);

    -- 1. Metadata Cleanup & Run Initialization
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 2. Processing Engine
    FOR r IN 
        SELECT * FROM employees 
        WHERE status = 'Active' 
        AND (join_date IS NULL OR join_date <= v_month_end)
    LOOP
        -- A. Fetch Rate Context
        SELECT 
            COALESCE(SUM(CASE WHEN name ILIKE '%housing%' THEN (CASE WHEN type='Percentage' THEN r.salary*value/100 ELSE value END) ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type='Percentage' THEN r.salary*value/100 ELSE value END), 0)
        INTO v_housing_rate, v_allowance_total
        FROM employee_allowances WHERE employee_id = r.id;

        -- B. Overtime with 25th Cutoff
        SELECT COALESCE(SUM(amount), 0) INTO v_ot_val 
        FROM variable_compensation 
        WHERE employee_id = r.id 
          AND comp_type = 'OVERTIME' 
          AND status = 'APPROVED_FOR_PAYROLL' 
          AND (payroll_run_id IS NULL OR payroll_run_id = v_run_id)
          AND COALESCE(effective_date, created_at::date) <= v_cutoff_date;

        UPDATE variable_compensation SET payroll_run_id = v_run_id
        WHERE employee_id = r.id AND comp_type = 'OVERTIME' AND status = 'APPROVED_FOR_PAYROLL' 
          AND payroll_run_id IS NULL AND COALESCE(effective_date, created_at::date) <= v_cutoff_date;

        -- C. Bonus Context
        SELECT COALESCE(SUM(amount), 0) INTO v_bonus_val
        FROM variable_compensation WHERE employee_id = r.id AND comp_type = 'BONUS' AND status = 'APPROVED_FOR_PAYROLL' AND (payroll_run_id IS NULL OR payroll_run_id = v_run_id);
        
        UPDATE variable_compensation SET payroll_run_id = v_run_id
        WHERE employee_id = r.id AND comp_type = 'BONUS' AND status = 'APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL;

        -- D. PIFSS Logic
        SELECT EXISTS(
            SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id 
            WHERE pi.employee_id=r.id AND pr.status='Finalized' AND pr.period_key ILIKE '%' || v_month_pattern || '%' AND pi.pifss_deduction > 0
        ) INTO v_pifss_paid;

        -- E. Calibrated Token Analysis
        SELECT 
            COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM leave_requests lr WHERE lr.employee_id=r.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d::date BETWEEN lr.start_date AND lr.end_date) AND NOT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end)),
            COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end)),
            COUNT(*) FILTER (WHERE d::date < COALESCE(r.join_date, v_month_start))
        INTO v_ld_count, v_s_count, v_pre_hire_count
        FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
        WHERE EXTRACT(DOW FROM d) != 5;

        -- F. The Calibrated Payout Math
        -- We convert Calendar Days to Budget Units: Units = Count * Factor
        -- If an employee is settled for the WHOLE month (e.g. Feb 24d), then v_s_count * v_cal_factor = 26.
        v_wd_units := GREATEST(0, 26.0 - ((v_ld_count + v_s_count + v_pre_hire_count) * v_cal_factor));
        -- If units are near zero (floating point precision), force to 0
        IF v_wd_units < 0.01 THEN v_wd_units := 0; END IF;

        v_wp := (v_wd_units * (r.salary + v_allowance_total) / 26.0);
        
        -- G. Sick Leave Segment Integration
        SELECT COALESCE(SUM(fn_count_working_days(start_date, end_date)), 0) INTO v_ytd_sick_used
        FROM leave_requests WHERE employee_id = r.id AND type='Sick' AND status IN ('Approved','Paid') AND start_date >= v_year_start AND start_date < v_month_start;

        SELECT COALESCE(SUM(
            (r.salary / 26.0) * (26.0 / v_cal_total_working_days) * -- Value of 1 calendar day in units
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

        v_lp_h := (v_ld_count * v_cal_factor * v_housing_rate / 26.0);

        -- H. Registration
        INSERT INTO payroll_items (
            run_id, employee_id, employee_name, basic_salary, net_salary, 
            allowance_breakdown, deduction_breakdown, pifss_deduction, pifss_employer_share
        ) VALUES (
            v_run_id, r.id, r.name, r.salary,
            (v_wp + v_lp_b + v_lp_h + v_ot_val + v_bonus_val - (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END)),
            -- Breakdown
            jsonb_build_array(
                jsonb_build_object('name', 'Days Worked Pay (' || ROUND(v_wd_units, 2) || ' units)', 'value', v_wp),
                jsonb_build_object('name', 'Leave Base Pay (' || v_ld_count || 'd Scaled)', 'value', v_lp_b),
                jsonb_build_object('name', 'Leave Housing Pay', 'value', v_lp_h),
                jsonb_build_object('name', 'Overtime Amount (Cutoff 25th)', 'value', v_ot_val),
                jsonb_build_object('name', 'Bonus Amount', 'value', v_bonus_val)
            ),
            -- Deductions
            jsonb_build_array(
                jsonb_build_object('name', 'PIFSS Emp Share (11.5%)', 'value', (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END)),
                jsonb_build_object('name', 'Full-Month Settlement Adjustment', 'value', 0)
            ),
            (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END),
            (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.125) ELSE 0 END)
        );
    END LOOP;

    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
