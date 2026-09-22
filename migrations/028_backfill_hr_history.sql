-- ============================================================================
-- LEAVE APP — BACKFILL HR PORTAL LEAVE HISTORY
-- ----------------------------------------------------------------------------
-- The mobile leave app only shows requests created inside the app, so
-- historical HR portal records (status 'Paid', created before migration 027
-- introduced collation) never appear in the app's "My Leaves".
--
-- This migration mirrors the HR portal's `leave_requests` history into the
-- leave app's `la_leave_requests` (mapped via employees.email -> la_users),
-- so staff members see their full leave history in the mobile app.
--
-- Rules:
--   * Rows that already carry a la_request_id are skipped -- those came FROM
--     the leave app (collation) and already exist there.
--   * Idempotent: each HR row is imported once (tracked by hr_request_id).
--   * History is tagged `source: 'hr_portal_backfill'` so it's easy to tell
--     imported rows apart from app-native ones.
--   * No deputy/manager/approval-log is fabricated; deputy_id is left as a
--     placeholder UUID (no real la_users row), so the detail page just renders
--     an empty replacement.
-- ============================================================================

ALTER TABLE la_leave_requests ADD COLUMN IF NOT EXISTS hr_request_id UUID;

-- Historical rows have no replacement; make deputy_id nullable so imports can
-- record "none". (The mobile detail page already renders a null deputy fine.)
ALTER TABLE la_leave_requests ALTER COLUMN deputy_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION la_import_hr_leave_history()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    INSERT INTO la_leave_requests (
        requester_id, leave_type, start_date, end_date, days, reason,
        contact_during, deputy_id, status, rejection_reason, rejection_step,
        history, created_at, hr_request_id
    )
    SELECT
        lu.id,
        lr.type,
        lr.start_date,
        lr.end_date,
        CASE WHEN lr.type = 'ShortPermission' THEN COALESCE(lr.duration_hours, 0) / 8.0
             ELSE lr.days END,
        lr.reason,
        NULL,                      -- contact_during
        NULL,                      -- deputy_id: no replacement recorded historically
        CASE lr.status
            WHEN 'Rejected'   THEN 'REJECTED'
            WHEN 'Cancelled'  THEN 'CANCELLED'
            WHEN 'Pending'    THEN 'PENDING'
            WHEN 'Manager_Approved' THEN 'MANAGER_APPROVED'
            WHEN 'HR_Approved' THEN 'HR_APPROVED'
            ELSE 'APPROVED'  -- Paid, HR_Finalized, Resumed, Pushed_To_Payroll ...
        END,
        NULL,
        NULL,
        jsonb_build_array(jsonb_build_object(
            'at', now(), 'actor', 'HR Portal', 'action', 'Imported from HR portal history',
            'source', 'hr_portal_backfill', 'hr_request_id', lr.id::text
        )),
        lr.created_at,
        lr.id
    FROM leave_requests lr
    JOIN employees e ON e.id = lr.employee_id
    JOIN la_users lu ON lower(lu.email) = lower(NULLIF(e.email, ''))
    WHERE lr.la_request_id IS NULL            -- skip rows that came from the app
      AND lr.type IN ('Annual', 'Sick', 'Emergency', 'ShortPermission') -- la schema types only
      AND NOT EXISTS (                        -- idempotent: only import once
        SELECT 1 FROM la_leave_requests x WHERE x.hr_request_id = lr.id
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Run it once for the current data.
SELECT la_import_hr_leave_history() AS backfilled_rows;

-- Verify: HR records now visible in the leave app, grouped by owner.
SELECT lu.email, count(*) AS la_rows
FROM la_leave_requests x
JOIN la_users lu ON lu.id = x.requester_id
WHERE x.hr_request_id IS NOT NULL
GROUP BY lu.email ORDER BY lu.email;