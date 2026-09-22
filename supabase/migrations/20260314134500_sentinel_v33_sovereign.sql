-- Sentinel V33 Sovereign: The Overtime Cutoff Standard
-- --------------------------------------------------------------------------------
-- 1. PROCEDURAL STABILITY: PL/pgSQL loop immune to Postgres parser limits.
-- 2. 26-DAY FIXED BUDGET: Monthly pay = (26 - Leave - Settled - PreHire) days.
-- 3. OVERTIME CUTOFF (New): Only includes OT with effective_date <= 25th of month.
--    Anything after the 25th remains pending for the next month's cycle.
-- 4. BONUS SUPPORT: Restored aggregation for Performance and Company Bonuses.
-- 5. SARAH PROTECTION: Token-based double-payment prevention.
-- 6. PIFSS GL: 11.5% Emp / 12.5% Co shares recorded.
-- 7. DETAILED AUDIT: Always shows Work/Leave/OT/Bonus components.
-- --------------------------------------------------------------------------------

-- Ensure the helper for counting working days is present and correct (26-day divisor context)
CREATE OR REPLACE FUNCTION fn_count_working_days(start_date DATE, end_date DATE)
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*)::INTEGER FROM generate_series(start_date, end_date, '1 day'::interval) d WHERE EXTRACT(DOW FROM d) != 5);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_run_id UUID := uuid_generate_v4();
    v_month_pattern TEXT := SUBSTRING(p_period_key FROM 1 FOR 7); 
    v_month_start DATE := TO_DATE(v_month_pattern || '-01', 'YYYY-MM-DD');
    v_month_end DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_cutoff_date DATE := (v_month_start + INTERVAL '24 days')::DATE; -- 25th of the month
    v_year_start DATE := TO_DATE(EXTRACT(YEAR FROM v_month_start) || '-01-01', 'YYYY-MM-DD');
    r RECORD;
    v_ld_count INT; v_s_count INT; v_pre_hire_count INT;
    v_wd_final INT; v_wp NUMERIC; v_lp_b NUMERIC; v_lp_h NUMERIC;
    v_pifss_paid BOOLEAN; v_housing_rate NUMERIC; v_allowance_total NUMERIC;
    v_ot_val NUMERIC; v_bonus_val NUMERIC; v_ytd_sick_used INT;
BEGIN
    -- 1. Metadata Cleanup & Initialization
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 2. Processing Loop
    FOR r IN 
        SELECT * FROM employees 
        WHERE status = 'Active' 
        AND (join_date IS NULL OR join_date <= v_month_end)
    LOOP
        -- A. Rate Context
        SELECT 
            COALESCE(SUM(CASE WHEN name ILIKE '%housing%' THEN (CASE WHEN type='Percentage' THEN r.salary*value/100 ELSE value END) ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type='Percentage' THEN r.salary*value/100 ELSE value END), 0)
        INTO v_housing_rate, v_allowance_total
        FROM employee_allowances WHERE employee_id = r.id;

        -- B. Variable Context (Overtime with 25th Cutoff)
        SELECT COALESCE(SUM(amount), 0) INTO v_ot_val 
        FROM variable_compensation 
        WHERE employee_id = r.id 
          AND comp_type = 'OVERTIME' 
          AND status = 'APPROVED_FOR_PAYROLL' 
          AND (payroll_run_id IS NULL OR payroll_run_id = v_run_id)
          AND COALESCE(effective_date, created_at::date) <= v_cutoff_date;

        -- Link items to this run so they are "claimed" by the draft
        UPDATE variable_compensation 
        SET payroll_run_id = v_run_id
        WHERE employee_id = r.id 
          AND comp_type = 'OVERTIME' 
          AND status = 'APPROVED_FOR_PAYROLL' 
          AND payroll_run_id IS NULL
          AND COALESCE(effective_date, created_at::date) <= v_cutoff_date;

        -- C. Bonus Context
        SELECT COALESCE(SUM(amount), 0) INTO v_bonus_val
        FROM variable_compensation 
        WHERE employee_id = r.id 
          AND comp_type = 'BONUS' 
          AND status = 'APPROVED_FOR_PAYROLL'
          AND (payroll_run_id IS NULL OR payroll_run_id = v_run_id);

        UPDATE variable_compensation 
        SET payroll_run_id = v_run_id
        WHERE employee_id = r.id 
          AND comp_type = 'BONUS' 
          AND status = 'APPROVED_FOR_PAYROLL' 
          AND payroll_run_id IS NULL;

        -- D. PIFSS Governance
        SELECT EXISTS(
            SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id 
            WHERE pi.employee_id=r.id AND pr.status='Finalized' AND pr.period_key ILIKE '%' || v_month_pattern || '%' AND pi.pifss_deduction > 0
        ) INTO v_pifss_paid;

        -- E. Day-Token Analysis
        SELECT 
            COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM leave_requests lr WHERE lr.employee_id=r.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d::date BETWEEN lr.start_date AND lr.end_date) AND NOT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end)),
            COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end)),
            COUNT(*) FILTER (WHERE d::date < COALESCE(r.join_date, v_month_start))
        INTO v_ld_count, v_s_count, v_pre_hire_count
        FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
        WHERE EXTRACT(DOW FROM d) != 5;

        -- F. 26-Day Budget Math
        v_wd_final := GREATEST(0, 26 - (v_ld_count + v_s_count + v_pre_hire_count));
        v_wp := (v_wd_final * (r.salary + v_allowance_total) / 26.0);
        
        -- G. Sick Segments Math
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

        -- H. Insert
        INSERT INTO payroll_items (
            run_id, employee_id, employee_name, basic_salary, net_salary, 
            allowance_breakdown, deduction_breakdown, pifss_deduction, pifss_employer_share
        ) VALUES (
            v_run_id, r.id, r.name, r.salary,
            (v_wp + v_lp_b + v_lp_h + v_ot_val + v_bonus_val - (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END)),
            -- Allowance Breakdown (Always shows all rows)
            jsonb_build_array(
                jsonb_build_object('name', 'Days Worked Pay (' || v_wd_final || 'd of 26)', 'value', v_wp),
                jsonb_build_object('name', 'Leave Base Pay (' || v_ld_count || 'd)', 'value', v_lp_b),
                jsonb_build_object('name', 'Leave Housing Pay', 'value', v_lp_h),
                jsonb_build_object('name', 'Overtime Amount', 'value', v_ot_val),
                jsonb_build_object('name', 'Bonus Amount', 'value', v_bonus_val)
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

-- Update Finalization Logic to be precise
CREATE OR REPLACE FUNCTION finalize_payroll_run(p_run_id UUID, p_actor_name TEXT, p_actor_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE payroll_runs SET status = 'Finalized' WHERE id = p_run_id;
    
    -- Lock ONLY the variable compensation that was linked to this run
    UPDATE variable_compensation 
    SET status = 'PROCESSED'
    WHERE payroll_run_id = p_run_id;

    -- Update leave requests matched to this run
    -- (Items pushed to payroll are handled by the day-token logic, but we mark them Paid for cleanup)
    UPDATE leave_requests
    SET status = 'Paid'
    WHERE status IN ('HR_Finalized', 'Pushed_To_Payroll')
      AND employee_id IN (SELECT employee_id FROM payroll_items WHERE run_id = p_run_id);
END;
$$;
