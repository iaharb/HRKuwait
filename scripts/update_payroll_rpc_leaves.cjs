const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

const sql = `
CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run_id UUID;
    v_total_disbursement NUMERIC := 0;
    v_month_start DATE;
    v_month_end DATE;
    v_total_work_days_in_month INTEGER;
BEGIN
    -- 1. Determine month bounds
    v_month_start := TO_DATE(SUBSTRING(p_period_key FROM 1 FOR 7) || '-01', 'YYYY-MM-DD');
    v_month_end := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_total_work_days_in_month := fn_count_working_days(v_month_start, v_month_end);

    -- 2. Clean up previous draft
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';
    v_run_id := gen_random_uuid();

    -- 3. Create active run
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW());

    -- 4. Unified Payroll Generation
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, housing_allowance, 
        other_allowances, leave_deductions, annual_leave_pay, sick_leave_pay, 
        unpaid_days, pifss_deduction, overtime_pay, bonus_pay, lateness_deductions,
        net_salary, verified_by_hr, created_at
    )
    SELECT 
        v_run_id, e.id, e.name, 
        
        -- A. Basic Salary: Prorated by Join Date & Deducting Absences/Settlements
        (e.salary / 26.0) * ( 
            (GREATEST(0, (
                fn_count_working_days(GREATEST(v_month_start, e.join_date), v_month_end) 
                - (COALESCE(lc.days_already_paid, 0) + COALESCE(lc.unpaid_days_count, 0) + COALESCE(lc.annual_leave_days, 0) + COALESCE(lc.sick_leave_days, 0) + COALESCE(lc.emergency_leave_days, 0))
            ))::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC) * 26.0 
        ),
        
        -- B. Allowances
        COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = true), 0),
        COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = false), 0),
        
        -- C. Leave Deductions (Visual breakdown of "Absent/Paid Leave" portion removed from Basic)
        (e.salary / 26.0) * ( 
            ( (fn_count_working_days(v_month_start, v_month_end) - fn_count_working_days(GREATEST(v_month_start, e.join_date), v_month_end)) 
            + COALESCE(lc.days_already_paid, 0) + COALESCE(lc.unpaid_days_count, 0) 
            + COALESCE(lc.annual_leave_days, 0) + COALESCE(lc.sick_leave_days, 0) + COALESCE(lc.emergency_leave_days, 0)
            )::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC * 26.0 
        ),
        
        -- D. Supplemental Payouts (Re-inserting the paid leave portions)
        (e.salary / 26.0) * ( (COALESCE(lc.annual_leave_days, 0)::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC) * 26.0 ),
        (e.salary / 26.0) * ( (COALESCE(lc.sick_leave_days, 0)::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC) * 26.0 ),
        
        COALESCE(lc.unpaid_days_count, 0),

        -- E. PIFSS
        CASE WHEN e.nationality = 'Kuwaiti' AND e.join_date <= v_month_start THEN (e.salary * 0.115) ELSE 0 END,

        -- F. Variable Comp
        COALESCE(vc.total_ot_kwd, 0),
        COALESCE(vc.total_bonus_kwd, 0),
        COALESCE(vc.total_deduction_kwd, 0),
        
        -- G. FINAL NET CALCULATION
        (
            -- Pro-rated Gross Total = Basic Portion + Paid Leave Portion + Allowances
            (
                (e.salary / 26.0) * ( (GREATEST(0, (fn_count_working_days(GREATEST(v_month_start, e.join_date), v_month_end) - (COALESCE(lc.days_already_paid, 0) + COALESCE(lc.unpaid_days_count, 0))))::NUMERIC / NULLIF(v_total_work_days_in_month, 0)::NUMERIC) * 26.0 )
                + COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id), 0)
            )
            
            -- Variable Adds
            + COALESCE(vc.total_ot_kwd, 0)
            + COALESCE(vc.total_bonus_kwd, 0)
            
            -- Variable Subs
            - COALESCE(vc.total_deduction_kwd, 0)
            
            -- Statutory Subs
            - (CASE WHEN e.nationality = 'Kuwaiti' AND e.join_date <= v_month_start THEN (e.salary * 0.115) ELSE 0 END)
        ),
        
        FALSE, NOW()
    FROM employees e
    LEFT JOIN LATERAL (
        SELECT 
            SUM(days_already_paid) as days_already_paid,
            SUM(unpaid_days_count) as unpaid_days_count,
            SUM(annual_leave_days) as annual_leave_days,
            SUM(sick_leave_days) as sick_leave_days,
            SUM(emergency_leave_days) as emergency_leave_days
        FROM (
            -- Segment 1: Hub Settled Days (EXPLICIT NAMES)
            SELECT 
                fn_count_working_days(GREATEST(v_month_start, pr.locked_start), LEAST(v_month_end, pr.locked_end)) as days_already_paid,
                0::NUMERIC as unpaid_days_count,
                0::NUMERIC as annual_leave_days,
                0::NUMERIC as sick_leave_days,
                0::NUMERIC as emergency_leave_days
            FROM payroll_runs pr
            JOIN payroll_items pi ON pr.id = pi.run_id
            WHERE pi.employee_id = e.id AND pr.cycle_type = 'Leave_Run' AND pr.status = 'Finalized'
              AND pr.locked_start <= v_month_end AND pr.locked_end >= v_month_start
            
            UNION ALL
            
            -- Segment 2: Standard Leaves (Pick up ANY Approved leave not yet settled)
            SELECT 
                0,
                CASE WHEN lr.type IN ('Unpaid', 'Loss of Pay') THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END,
                CASE WHEN lr.type IN ('Annual', 'Haj', 'Maternity') THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END,
                CASE WHEN lr.type = 'Sick' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END,
                CASE WHEN lr.type = 'Emergency' THEN fn_count_working_days(GREATEST(v_month_start, lr.start_date), LEAST(v_month_end, lr.end_date)) ELSE 0 END
            FROM leave_requests lr
            WHERE lr.employee_id = e.id 
              AND lr.status IN ('Approved', 'Pushed_To_Payroll') -- Picking up both settled-push and standard-approved
              AND lr.start_date <= v_month_end AND lr.end_date >= v_month_start
              -- IMPORTANT: Ensure we don't count leaves that were ALREADY settled in Segment 1
              AND NOT EXISTS (
                  SELECT 1 FROM payroll_runs pr2 
                  JOIN payroll_items pi2 ON pr2.id = pi2.run_id
                  WHERE pi2.employee_id = lr.employee_id 
                    AND pr2.cycle_type = 'Leave_Run' 
                    AND pr2.status = 'Finalized'
                    AND pr2.locked_start <= lr.end_date
                    AND pr2.locked_end >= lr.start_date
              )
        ) sub
    ) lc ON TRUE
    LEFT JOIN LATERAL (
        SELECT 
            SUM(CASE WHEN comp_type = 'OVERTIME' THEN calculated_kwd ELSE 0 END) as total_ot_kwd,
            SUM(CASE WHEN comp_type = 'BONUS' THEN calculated_kwd ELSE 0 END) as total_bonus_kwd,
            SUM(CASE WHEN comp_type IN ('DEDUCTION', 'LATENESS') THEN calculated_kwd ELSE 0 END) as total_deduction_kwd
        FROM variable_compensation
        WHERE employee_id = e.id 
          AND status = 'APPROVED_FOR_PAYROLL'
          AND payroll_run_id IS NULL
    ) vc ON TRUE
    WHERE e.status = 'Active' 
      AND e.join_date <= v_month_end;

    -- 5. Summary & Return
    UPDATE payroll_runs SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id) WHERE id = v_run_id;
    RETURN jsonb_build_object('id', v_run_id, 'total', (SELECT total_disbursement FROM payroll_runs WHERE id = v_run_id));
END;
$$;
`;

async function main() {
    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('SQL Error:', error.message);
        process.exit(1);
    }
    console.log('Successfully updated generate_payroll_draft with comprehensive leave handling');
    process.exit(0);
}

main();
