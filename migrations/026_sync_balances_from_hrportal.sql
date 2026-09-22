-- ============================================================================
-- LEAVE APP — SYNC BALANCES FROM HR PORTAL
-- ----------------------------------------------------------------------------
-- Pulls the authoritative per-user leave balances out of the HR portal's
-- `leave_balances` table (via employees.email) and mirrors them into the
-- leave app's isolated `la_leave_balances` table for the current year.
--
-- Idempotent: re-running simply re-syncs (hrportal stays the source of truth).
-- ============================================================================

-- Reusable sync function (callable as postgres / via deploy script).
CREATE OR REPLACE FUNCTION la_sync_hr_balances(p_year INTEGER DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);
    v_count INTEGER;
BEGIN
    INSERT INTO la_leave_balances (user_id, leave_type, year, entitled_days, used_days)
    SELECT lu.id, lb.leave_type, lb.year, lb.entitled_days, lb.used_days
    FROM leave_balances lb
    JOIN employees e ON e.id = lb.employee_id
    JOIN la_users lu ON lower(lu.email) = lower(NULLIF(e.email, ''))
    WHERE lb.leave_type IN ('Annual', 'Sick', 'Emergency', 'ShortPermission')
      AND lb.year = v_year
    ON CONFLICT (user_id, leave_type, year) DO UPDATE SET
        entitled_days = EXCLUDED.entitled_days,
        used_days     = EXCLUDED.used_days;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Run it once during migration.
SELECT la_sync_hr_balances(NULL) AS synced_rows;