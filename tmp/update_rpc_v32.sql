-- Sentinel V32: The 'Onboarding Supreme Sovereign'
-- 1. Excludes future hires (join_date > month_end).
-- 2. Pro-rates mid-month hires by subtracting "Days Before Hire" from the 26-day budget.
-- 3. Maintained 26-Day Fixed Budget logic (February Fix).
-- 4. Maintained GL Integration (12.5% Employer PIFSS).
-- 5. Maintained Procedural stability (immune to Parser aggregation errors).

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_run_id UUID := uuid_generate_v4();
    v_month_pattern TEXT := SUBSTRING(p_period_key FROM 1 FOR 7); 
    v_month_start DATE := TO_DATE(v_month_pattern || '-01', 'YYYY-MM-DD');
    v_month_end DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    r RECORD;
    -- Calculation Variables
    v_ld_count INT; v_s_count INT; v_pre_hire_count INT;
    v_wd_final INT; v_wp NUMERIC; v_lp_b NUMERIC; v_lp_h NUMERIC;
    v_pifss_paid BOOLEAN; v_housing_rate NUMERIC; v_allowance_total NUMERIC;
    v_ot_val NUMERIC;
BEGIN
    -- 1. Metadata Cleanup
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 2. Employee Logic Loop
    FOR r IN 
        SELECT * FROM employees 
        WHERE status = 'Active' 
        AND (join_date IS NULL OR join_date <= v_month_end)
    LOOP
        -- A. Allowance Context
        SELECT 
            COALESCE(SUM(CASE WHEN name ILIKE '%housing%' THEN (CASE WHEN type='Percentage' THEN r.salary*value/100 ELSE value END) ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type='Percentage' THEN r.salary*value/100 ELSE value END), 0)
        INTO v_housing_rate, v_allowance_total
        FROM employee_allowances WHERE employee_id = r.id;

        -- B. Variable Context (Overtime)
        SELECT COALESCE(SUM(amount), 0) INTO v_ot_val 
        FROM variable_compensation 
        WHERE employee_id=r.id AND comp_type='OVERTIME' AND status='APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL;

        -- C. PIFSS Governance (Deduct only once per month)
        SELECT EXISTS(
            SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id 
            WHERE pi.employee_id=r.id AND pr.status='Finalized' 
            AND pr.period_key ILIKE '%' || v_month_pattern || '%' AND pi.pifss_deduction > 0
        ) INTO v_pifss_paid;

        -- D. Day-Token & Join-Date Pro-ration Analysis
        -- 1. Count Leave Days (Active, not yet paid)
        SELECT COUNT(*) INTO v_ld_count
        FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
        WHERE EXTRACT(DOW FROM d) != 5 
        AND d::date >= COALESCE(r.join_date, v_month_start)
        AND EXISTS(SELECT 1 FROM leave_requests lr WHERE lr.employee_id=r.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d::date BETWEEN lr.start_date AND lr.end_date)
        AND NOT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end);

        -- 2. Count Already Settled Days (Sarah's Straddle)
        SELECT COUNT(*) INTO v_s_count
        FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
        WHERE EXTRACT(DOW FROM d) != 5 
        AND EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end);

        -- 3. Count Pre-Hire Days (Mid-month hires pro-ration)
        SELECT COUNT(*) INTO v_pre_hire_count
        FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
        WHERE EXTRACT(DOW FROM d) != 5 
        AND d::date < COALESCE(r.join_date, v_month_start);

        -- E. The 26-Day Sovereign Calculation
        -- Payable Work Days = 26 - (Leaves) - (Settled) - (Days before joining)
        v_wd_final := GREATEST(0, 26 - (v_ld_count + v_s_count + v_pre_hire_count));
        v_wp := (v_wd_final * (r.salary + v_allowance_total) / 26.0);
        
        -- Exact Leave Pay (Base)
        SELECT COALESCE(SUM(r.salary / 26.0), 0) INTO v_lp_b
        FROM generate_series(v_month_start, v_month_end, '1 day'::interval) d
        WHERE EXTRACT(DOW FROM d) != 5 
        AND d::date >= COALESCE(r.join_date, v_month_start)
        AND EXISTS(SELECT 1 FROM leave_requests lr WHERE lr.employee_id=r.id AND lr.status IN ('Approved','Paid','HR_Finalized') AND d::date BETWEEN lr.start_date AND lr.end_date)
        AND NOT EXISTS(SELECT 1 FROM payroll_runs pr JOIN payroll_items pi ON pr.id=pi.run_id WHERE pi.employee_id=r.id AND pr.status='Finalized' AND d::date BETWEEN pr.locked_start AND pr.locked_end);

        -- Leave Pay (Housing)
        v_lp_h := (v_ld_count * v_housing_rate / 26.0);

        -- F. Registry Commit
        INSERT INTO payroll_items (
            run_id, employee_id, employee_name, basic_salary, net_salary, 
            allowance_breakdown, deduction_breakdown, pifss_deduction, pifss_employer_share
        ) VALUES (
            v_run_id, r.id, r.name, r.salary,
            -- Net Pay (Sum of all components)
            (v_wp + v_lp_b + v_lp_h + v_ot_val - (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END)),
            -- Allowance Breakdown (Audit Detail)
            jsonb_build_array(
                jsonb_build_object('name', 'Days Worked Pay (' || v_wd_final || 'd of 26)', 'value', v_wp),
                jsonb_build_object('name', 'Leave Base Pay (' || v_ld_count || 'd)', 'value', v_lp_b),
                jsonb_build_object('name', 'Leave Housing Pay', 'value', v_lp_h),
                jsonb_build_object('name', 'Overtime Amount', 'value', v_ot_val)
            ),
            -- Deduction Breakdown (Audit Detail)
            jsonb_build_array(
                jsonb_build_object('name', 'PIFSS (11.5%)', 'value', (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END)),
                jsonb_build_object('name', 'Settled/Pre-Hire/Leave Skip (' || (v_s_count + v_pre_hire_count + v_ld_count) || 'd)', 'value', 0)
            ),
            -- PIFSS Pillars (Employee 11.5% / Co 12.5%)
            (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.115) ELSE 0 END),
            (CASE WHEN (r.nationality='Kuwaiti' AND NOT v_pifss_paid) THEN (r.salary*0.125) ELSE 0 END)
        );
    END LOOP;

    -- 3. Finalize Run Total
    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
