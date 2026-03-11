
-- 1. Fix the check constraint to include 'Resumed'
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check 
CHECK (status IN ('Pending', 'Manager_Approved', 'HR_Approved', 'Resumed', 'HR_Finalized', 'Rejected', 'Paid', 'Pushed_To_Payroll'));

-- 2. Update the trigger function to include 'Resumed' in balance calculations
CREATE OR REPLACE FUNCTION update_leave_balances()
RETURNS TRIGGER AS $$
DECLARE
    emp_id UUID;
    v_annual NUMERIC := 0;
    v_sick NUMERIC := 0;
    v_hajj NUMERIC := 0;
    v_emergency NUMERIC := 0;
    v_short_perm NUMERIC := 0;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        emp_id := OLD.employee_id;
    ELSE
        emp_id := NEW.employee_id;
    END IF;

    -- We count everything that is approved or finalized
    -- Including 'Resumed' which was missing
    WITH approved_leaves AS (
        SELECT 
            type, 
            COALESCE(SUM(days), 0) as total_days,
            COALESCE(SUM(duration_hours), 0) as total_hours
        FROM leave_requests
        WHERE employee_id = emp_id
          AND status IN ('Manager_Approved', 'HR_Approved', 'Resumed', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
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

-- 3. Force a full sync for all employees now
DO $$
DECLARE
    emp RECORD;
    v_annual NUMERIC;
    v_sick NUMERIC;
    v_hajj NUMERIC;
    v_emergency NUMERIC;
    v_short_perm NUMERIC;
BEGIN
    FOR emp IN SELECT id FROM employees LOOP
        WITH approved_leaves AS (
            SELECT 
                type, 
                COALESCE(SUM(days), 0) as total_days,
                COALESCE(SUM(duration_hours), 0) as total_hours
            FROM leave_requests
            WHERE employee_id = emp.id
              AND status IN ('Manager_Approved', 'HR_Approved', 'Resumed', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
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
