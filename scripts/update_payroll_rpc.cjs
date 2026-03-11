const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

const sql = `
-- Sentinel V12: 'The Granular Sick Auditor'
-- Implements Kuwait Labor Law Sick Segments:
-- 15 Days @ 100% | 15 Days @ 75% | 15 Days @ 25% | After 45: 0%

CREATE OR REPLACE FUNCTION fn_calculate_sick_pay(p_emp_id UUID, p_days NUMERIC, p_daily_rate NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
    v_past_used NUMERIC := 0;
    v_total_pay NUMERIC := 0;
    v_day_num INTEGER;
    v_mult NUMERIC;
BEGIN
    SELECT COALESCE(used_days, 0) INTO v_past_used FROM leave_balances WHERE employee_id = p_emp_id AND leave_type = 'Sick';
    
    FOR i IN 1..FLOOR(p_days) LOOP
        v_day_num := v_past_used + i;
        IF v_day_num <= 15 THEN v_mult := 1.0;
        ELSIF v_day_num <= 30 THEN v_mult := 0.75;
        ELSIF v_day_num <= 45 THEN v_mult := 0.25;
        ELSE v_mult := 0.0;
        END IF;
        v_total_pay := v_total_pay + (p_daily_rate * v_mult);
    END LOOP;
    
    IF p_days % 1 > 0 THEN
        v_day_num := v_past_used + CEIL(p_days);
        IF v_day_num <= 15 THEN v_mult := 1.0;
        ELSIF v_day_num <= 30 THEN v_mult := 0.75;
        ELSIF v_day_num <= 45 THEN v_mult := 0.25;
        ELSE v_mult := 0.0;
        END IF;
        v_total_pay := v_total_pay + (p_daily_rate * v_mult * (p_days % 1));
    END IF;

    RETURN v_total_pay;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run_id UUID;
    v_month_start DATE;
    v_month_end DATE;
    v_total_days INTEGER;
BEGIN
    v_month_start := TO_DATE(SUBSTRING(p_period_key FROM 1 FOR 7) || '-01', 'YYYY-MM-DD');
    v_month_end := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_total_days := fn_count_working_days(v_month_start, v_month_end);

    -- 1. DEFENSIVE CLEANUP: Clear all dependencies pointing to ANY draft run for this period
    -- This prevents the "Critical FK Violation" when re-running audits.
    
    -- Clear Linked JVs
    DELETE FROM journal_entries 
    WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft');

    -- Unpin VarComp
    UPDATE variable_compensation 
    SET payroll_run_id = NULL 
    WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft');

    -- Revert Leaves
    UPDATE leave_requests
    SET status = 'HR_Finalized'
    WHERE (status = 'Paid' OR status = 'Pushed_To_Payroll')
      AND id IN (
        SELECT id FROM leave_requests WHERE id IN (
          SELECT target_leave_id FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft'
        )
      );

    -- 2. RESET RUN
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';
    v_run_id := gen_random_uuid();

    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at, locked_start, locked_end)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW(), v_month_start, v_month_end);

    -- 3. CALCULATION & INSERT
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, housing_allowance, 
        other_allowances, annual_leave_pay, sick_leave_pay, 
        leave_deductions, pifss_deduction, overtime_pay, bonus_pay, lateness_deductions,
        net_salary, verified_by_hr, created_at, allowance_breakdown, deduction_breakdown,
        performance_bonus, company_bonus
    )
    SELECT 
        v_run_id, e.id, e.name,
        
        -- Basic Salary (26-day normalize)
        (e.salary / 26.0) * (26.0 - COALESCE(lc.cur_lv_units, 0)),
        COALESCE(al.housing, 0), 
        COALESCE(al.others, 0),
        
        -- Leave Payouts
        (e.salary / 26.0) * COALESCE(lc.unpaid_annual_units, 0),
        fn_calculate_sick_pay(e.id, COALESCE(lc.unpaid_sick_units, 0), (e.salary / 26.0)),
        
        0, 
        CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.115) ELSE 0 END,
        
        COALESCE(vc.ot, 0), 
        (COALESCE(vc.perf, 0) + COALESCE(vc.pool, 0) + COALESCE(vc.bonus, 0)),
        COALESCE(vc.late, 0),

        -- FINAL NET
        (
          ((e.salary + COALESCE(al.total_all, 0)) / 26.0) * (26.0 - COALESCE(lc.cur_lv_units, 0))
          + ((e.salary + COALESCE(al.housing, 0)) / 26.0) * COALESCE(lc.unpaid_annual_units, 0)
          + fn_calculate_sick_pay(e.id, COALESCE(lc.unpaid_sick_units, 0), (e.salary + COALESCE(al.housing, 0)) / 26.0)
          + COALESCE(vc.ot, 0) + COALESCE(vc.perf, 0) + COALESCE(vc.pool, 0) + COALESCE(vc.bonus, 0) - COALESCE(vc.late, 0)
          - (CASE WHEN e.nationality = 'Kuwaiti' THEN (e.salary * 0.115) ELSE 0 END)
        ),

        FALSE, NOW(),

        -- JSON BREAKDOWN (Earnings)
        (
          SELECT COALESCE(jsonb_agg(to_jsonb(j)), '[]'::jsonb) FROM (
            SELECT 'Contractual Gross (Baseline)' as name, (e.salary + COALESCE(al.total_all, 0)) as value
            UNION ALL
            SELECT 'Basic Pay (Work: ' || (26.0 - COALESCE(lc.cur_lv_units, 0)) || ' days)' as name, (e.salary / 26.0) * (26.0 - COALESCE(lc.cur_lv_units, 0)) as value WHERE (26.0 - COALESCE(lc.cur_lv_units, 0)) > 0
            UNION ALL
            SELECT 'Annual Leave Pay (' || COALESCE(lc.unpaid_annual_units, 0) || 'd)' as name, ((e.salary + COALESCE(al.housing, 0)) / 26.0) * COALESCE(lc.unpaid_annual_units, 0) as value WHERE COALESCE(lc.unpaid_annual_units, 0) > 0
            UNION ALL
            SELECT 'Sick Leave Pay (' || COALESCE(lc.unpaid_sick_units, 0) || 'd)' as name, fn_calculate_sick_pay(e.id, COALESCE(lc.unpaid_sick_units, 0), (e.salary + COALESCE(al.housing, 0)) / 26.0) as value WHERE COALESCE(lc.unpaid_sick_units, 0) > 0
            UNION ALL
            SELECT 'Performance Bonus' as name, vc.perf as value WHERE vc.perf > 0
            UNION ALL
            SELECT 'Company Pool Bonus' as name, vc.pool as value WHERE vc.pool > 0
            UNION ALL
            SELECT 'Overtime' as name, vc.ot as value WHERE vc.ot > 0
          ) j
        ),

        -- JSON BREAKDOWN (Deductions)
        (
          SELECT COALESCE(jsonb_agg(to_jsonb(j)), '[]'::jsonb) FROM (
            SELECT 'PIFSS Social Security' as name, (e.salary * 0.115) as value WHERE e.nationality = 'Kuwaiti'
            UNION ALL
            SELECT 'Sick Segment Adjustment' as name, (((e.salary + COALESCE(al.housing, 0)) / 26.0) * COALESCE(lc.unpaid_sick_units, 0)) - fn_calculate_sick_pay(e.id, COALESCE(lc.unpaid_sick_units, 0), (e.salary + COALESCE(al.housing, 0)) / 26.0) as value WHERE COALESCE(lc.unpaid_sick_units, 0) > 0 AND (((e.salary + COALESCE(al.housing, 0)) / 26.0) * COALESCE(lc.unpaid_sick_units, 0)) - fn_calculate_sick_pay(e.id, COALESCE(lc.unpaid_sick_units, 0), (e.salary + COALESCE(al.housing, 0)) / 26.0) > 0
            UNION ALL
            SELECT 'Deductible Allowance Loss' as name, (COALESCE(al.others, 0) / 26.0) * COALESCE(lc.cur_lv_units, 0) as value WHERE COALESCE(al.others, 0) > 0 AND COALESCE(lc.cur_lv_units, 0) > 0
            UNION ALL
            SELECT 'Attendance Fine' as name, vc.late as value WHERE vc.late > 0
          ) j
        ),
        
        COALESCE(vc.perf, 0),
        COALESCE(vc.pool, 0)

    FROM employees e
    LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN is_housing THEN value ELSE 0 END) as housing, SUM(CASE WHEN NOT is_housing THEN value ELSE 0 END) as others, SUM(value) as total_all
        FROM employee_allowances WHERE employee_id = e.id
    ) al ON TRUE
    LEFT JOIN LATERAL (
        SELECT 
            SUM(cur_lv) as cur_lv_units,
            SUM(unpaid_annual) as unpaid_annual_units,
            SUM(unpaid_sick) as unpaid_sick_units
        FROM (
            -- Simplified current leave units counting
            SELECT 
                fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date))::NUMERIC as cur_lv,
                CASE WHEN lr.type = 'Annual' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END as unpaid_annual,
                CASE WHEN lr.type = 'Sick' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END as unpaid_sick
            FROM leave_requests lr
            WHERE lr.employee_id = e.id 
              AND lr.status IN ('Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid', 'Resumed')
              AND lr.start_date <= v_month_end AND lr.end_date >= v_month_start
        ) s
    ) lc ON TRUE
    LEFT JOIN LATERAL (
        SELECT 
          SUM(CASE WHEN comp_type = 'OVERTIME' THEN COALESCE(calculated_kwd, amount) ELSE 0 END) as ot, 
          SUM(CASE WHEN comp_type = 'PERFORMANCE_BONUS' THEN COALESCE(calculated_kwd, amount) ELSE 0 END) as perf, 
          SUM(CASE WHEN comp_type = 'COMPANY_BONUS' THEN COALESCE(calculated_kwd, amount) ELSE 0 END) as pool, 
          SUM(CASE WHEN comp_type = 'BONUS' THEN COALESCE(calculated_kwd, amount) ELSE 0 END) as bonus, 
          SUM(CASE WHEN comp_type IN ('DEDUCTION', 'LATENESS') THEN COALESCE(calculated_kwd, amount) ELSE 0 END) as late
        FROM variable_compensation WHERE employee_id = e.id AND status = 'APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL
    ) vc ON TRUE
    WHERE e.status = 'Active' AND e.join_date <= v_month_end;

    RETURN jsonb_build_object('id', v_run_id);
END;
$$;
`;

async function main() {
    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('SQL Error:', error.message);
        process.exit(1);
    }
    console.log('Successfully updated generate_payroll_draft');
    process.exit(0);
}

main();
