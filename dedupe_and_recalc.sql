
-- Deduplicate leave_requests
DELETE FROM leave_requests
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY employee_id, type, start_date ORDER BY created_at DESC) as row_num
        FROM leave_requests
    ) t
    WHERE t.row_num > 1
);

-- After deduplication, recalculate balances for all employees
DO $$
DECLARE
    emp RECORD;
    v_sick NUMERIC := 0;
    v_hajj NUMERIC := 0;
    v_business NUMERIC := 0;
    v_annual NUMERIC := 0;
    v_emergency NUMERIC := 0;
    v_short_perm NUMERIC := 0;
    
    calc_annual NUMERIC := 0;
    calc_sick NUMERIC := 0;
    calc_emergency NUMERIC := 0;
    calc_short_perm NUMERIC := 0;
    calc_hajj NUMERIC := 0;
BEGIN
    FOR emp IN SELECT id FROM employees LOOP
        WITH approved_leaves AS (
            SELECT 
                type, 
                COALESCE(SUM(days), 0) as total_days,
                COALESCE(SUM(duration_hours), 0) as total_hours
            FROM leave_requests
            WHERE employee_id = emp.id
              AND status IN ('Manager_Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
            GROUP BY type
        )
        SELECT 
            COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Annual'), 0),
            COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Sick'), 0),
            COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Emergency'), 0),
            COALESCE((SELECT total_hours FROM approved_leaves WHERE type = 'ShortPermission'), 0),
            COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Hajj'), 0),
            COALESCE((SELECT SUM(
                CASE WHEN type = 'ShortPermission' THEN total_hours / 8.0 ELSE total_days END
            ) FROM approved_leaves WHERE type NOT IN ('Sick', 'Business', 'Hajj', 'Annual')), 0)
        INTO v_annual, v_sick, v_emergency, v_short_perm, v_hajj, v_business;

        calc_annual := v_annual + v_business;
        calc_sick := v_sick;
        calc_emergency := v_emergency;
        calc_short_perm := v_short_perm;
        calc_hajj := v_hajj;

        UPDATE leave_balances SET used_days = ROUND(calc_annual, 2) WHERE employee_id = emp.id AND leave_type = 'Annual' AND year = 2026;
        UPDATE leave_balances SET used_days = ROUND(calc_sick, 2) WHERE employee_id = emp.id AND leave_type = 'Sick' AND year = 2026;
        UPDATE leave_balances SET used_days = ROUND(calc_emergency, 2) WHERE employee_id = emp.id AND leave_type = 'Emergency' AND year = 2026;
        UPDATE leave_balances SET used_days = ROUND(calc_short_perm, 2) WHERE employee_id = emp.id AND leave_type = 'ShortPermission' AND year = 2026;
        UPDATE leave_balances SET used_days = ROUND(calc_hajj, 2) WHERE employee_id = emp.id AND leave_type = 'Hajj' AND year = 2026;
    END LOOP;
END;
$$;
