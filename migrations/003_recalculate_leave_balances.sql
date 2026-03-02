-- Migration: Recalculate leaves using a trigger to ensure they are always in sync

-- First, create the function that recalculates the balance when leave requests change.
CREATE OR REPLACE FUNCTION update_leave_balances()
RETURNS TRIGGER AS $$
DECLARE
    emp_id UUID;
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
    -- Determine which employee ID to act on
    IF (TG_OP = 'DELETE') THEN
        emp_id := OLD.employee_id;
    ELSE
        emp_id := NEW.employee_id;
    END IF;

    -- Calculate sums for this employee (only approved/paid logs)
    -- All types EXCEPT Sick, Business, Hajj will deduct from Annual
    
    -- Calculate sums for this employee (only approved/paid logs)
    -- ALL types EXCEPT Sick and Hajj will deduct from the Annual pool
    -- including Emergency, Maternity, ShortPermission (converted to days), etc.
    
    WITH approved_leaves AS (
        SELECT 
            type, 
            COALESCE(SUM(days), 0) as total_days,
            COALESCE(SUM(duration_hours), 0) as total_hours
        FROM leave_requests
        WHERE employee_id = emp_id
          AND status IN ('Manager_Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
        GROUP BY type
    )
    SELECT 
        COALESCE((SELECT SUM(
            CASE 
                WHEN type = 'ShortPermission' THEN total_hours / 8.0 
                ELSE total_days 
            END
        ) FROM approved_leaves WHERE type NOT IN ('Sick', 'Hajj')), 0),
        COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Sick'), 0),
        COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Hajj'), 0),
        COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Emergency'), 0),
        COALESCE((SELECT total_hours FROM approved_leaves WHERE type = 'ShortPermission'), 0)
    INTO v_annual, v_sick, v_hajj, v_emergency, v_short_perm;

    -- Update the leave_balances table
    -- v_annual now contains the total days to be deducted from the Annual pool
    UPDATE leave_balances SET used_days = ROUND(v_annual, 2) WHERE employee_id = emp_id AND leave_type = 'Annual' AND year = 2026;
    UPDATE leave_balances SET used_days = ROUND(v_sick, 2) WHERE employee_id = emp_id AND leave_type = 'Sick' AND year = 2026;
    UPDATE leave_balances SET used_days = ROUND(v_hajj, 2) WHERE employee_id = emp_id AND leave_type = 'Hajj' AND year = 2026;
    UPDATE leave_balances SET used_days = ROUND(v_emergency, 2) WHERE employee_id = emp_id AND leave_type = 'Emergency' AND year = 2026;
    UPDATE leave_balances SET used_days = ROUND(v_short_perm, 2) WHERE employee_id = emp_id AND leave_type = 'ShortPermission' AND year = 2026;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop and re-create the trigger to guarantee updates run on each event
DROP TRIGGER IF EXISTS trg_update_leave_balances ON leave_requests;
CREATE TRIGGER trg_update_leave_balances
AFTER INSERT OR UPDATE OR DELETE ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_leave_balances();


-- Finally, loop over all existing employees to force a recalculation immediately
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
            COALESCE((SELECT SUM(
                CASE 
                    WHEN type = 'ShortPermission' THEN total_hours / 8.0 
                    ELSE total_days 
                END
            ) FROM approved_leaves WHERE type NOT IN ('Sick', 'Hajj')), 0),
            COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Sick'), 0),
            COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Hajj'), 0),
            COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Emergency'), 0),
            COALESCE((SELECT total_hours FROM approved_leaves WHERE type = 'ShortPermission'), 0)
        INTO v_annual, v_sick, v_hajj, v_emergency, v_short_perm;

        UPDATE leave_balances SET used_days = ROUND(v_annual, 2) WHERE employee_id = emp.id AND leave_type = 'Annual' AND year = 2026;
        UPDATE leave_balances SET used_days = ROUND(v_sick, 2) WHERE employee_id = emp.id AND leave_type = 'Sick' AND year = 2026;
        UPDATE leave_balances SET used_days = ROUND(v_hajj, 2) WHERE employee_id = emp.id AND leave_type = 'Hajj' AND year = 2026;
        UPDATE leave_balances SET used_days = ROUND(v_emergency, 2) WHERE employee_id = emp.id AND leave_type = 'Emergency' AND year = 2026;
        UPDATE leave_balances SET used_days = ROUND(v_short_perm, 2) WHERE employee_id = emp.id AND leave_type = 'ShortPermission' AND year = 2026;
    END LOOP;
END;
$$;
