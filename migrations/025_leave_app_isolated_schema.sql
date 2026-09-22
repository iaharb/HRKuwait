-- ============================================================================
-- LEAVE APP — ISOLATED BACKEND
-- ----------------------------------------------------------------------------
-- A standalone, fully isolated backend for the Leave/Vacation app.
-- Purposely separate from the main HR portal's `leave_requests` /
-- `leave_balances` tables. Tables are prefixed `la_` so the HR portal
-- never reads from or writes to them, and vice-versa.
--
-- Identity:  login uses Supabase Auth (existing email accounts).
--            la_users.email MUST equal the auth user's email.
-- Workflow:  Submit -> Deputy concurrence -> Line manager -> HR (balance)
--            -> CEO final approval.  Any rejection bounces back to the
--            employee with a reason.  Enforcement is inside SECURITY
--            DEFINER RPCs keyed off the signed JWT (auth.jwt()).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

-- 1.1 Users (independent roster for the leave app)
CREATE TABLE IF NOT EXISTS la_users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('staff', 'manager', 'hr', 'ceo')),
    department  TEXT,
    position    TEXT,
    manager_id  UUID REFERENCES la_users(id),
    joined_on   DATE,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 1.2 Leave balances (per user, per type, per year)
CREATE TABLE IF NOT EXISTS la_leave_balances (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES la_users(id) ON DELETE CASCADE,
    leave_type     TEXT NOT NULL CHECK (leave_type IN ('Annual', 'Sick', 'Emergency', 'ShortPermission')),
    year           INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
    entitled_days  NUMERIC NOT NULL DEFAULT 0,
    used_days      NUMERIC NOT NULL DEFAULT 0,
    UNIQUE (user_id, leave_type, year)
);

-- 1.3 Leave requests
CREATE TABLE IF NOT EXISTS la_leave_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id      UUID NOT NULL REFERENCES la_users(id) ON DELETE CASCADE,
    leave_type        TEXT NOT NULL CHECK (leave_type IN ('Annual', 'Sick', 'Emergency', 'ShortPermission')),
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    days              NUMERIC NOT NULL DEFAULT 0,
    reason            TEXT,
    contact_during    TEXT,
    deputy_id         UUID NOT NULL REFERENCES la_users(id),  -- concurring replacement
    status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN (
                          'PENDING',            -- waiting on deputy concurrence
                          'DEPUTY_CONFIRMED',   -- waiting on line manager
                          'MANAGER_APPROVED',   -- waiting on HR
                          'HR_APPROVED',        -- waiting on CEO
                          'APPROVED',           -- fully approved (CEO)
                          'REJECTED',           -- bounced back to employee
                          'CANCELLED'           -- withdrawn by employee
                      )),
    rejection_reason  TEXT,
    rejection_step    TEXT CHECK (rejection_step IN ('deputy', 'manager', 'hr', 'ceo')),
    history           JSONB NOT NULL DEFAULT '[]',
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    CHECK (end_date >= start_date)
);

-- 1.4 Approval audit log (normalized)
CREATE TABLE IF NOT EXISTS la_approval_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  UUID NOT NULL REFERENCES la_leave_requests(id) ON DELETE CASCADE,
    step        TEXT NOT NULL CHECK (step IN ('submit', 'deputy', 'manager', 'hr', 'ceo', 'cancel')),
    actor_id    UUID REFERENCES la_users(id),
    action      TEXT NOT NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 1.5 Notifications
CREATE TABLE IF NOT EXISTS la_notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES la_users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    body         TEXT,
    is_read      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_la_requests_requester ON la_leave_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_la_requests_deputy     ON la_leave_requests(deputy_id);
CREATE INDEX IF NOT EXISTS idx_la_requests_status     ON la_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_la_notifications_user  ON la_notifications(user_id);

-- 1.6 updated_at trigger
CREATE OR REPLACE FUNCTION la_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_la_requests_updated ON la_leave_requests;
CREATE TRIGGER trg_la_requests_updated
    BEFORE UPDATE ON la_leave_requests
    FOR EACH ROW EXECUTE FUNCTION la_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE la_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE la_leave_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE la_leave_balances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE la_approval_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE la_notifications   ENABLE ROW LEVEL SECURITY;

-- Directory: any authenticated user may list colleagues (needed for deputy picker).
DROP POLICY IF EXISTS la_users_read ON la_users;
CREATE POLICY la_users_read ON la_users
    FOR SELECT TO authenticated USING (true);

-- All other writes/reads go exclusively through SECURITY DEFINER RPCs (below).
-- No table grants/policies are given to clients for the other la_* tables.

-- ---------------------------------------------------------------------------
-- 3. INTERNAL HELPERS (needed after the tables exist)
-- ---------------------------------------------------------------------------

-- Working days between two dates, inclusive. Friday (DOW = 5) excluded.
CREATE OR REPLACE FUNCTION la_count_working_days(p_start DATE, p_end DATE)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COUNT(*)::numeric
  FROM generate_series(p_start, p_end, '1 day'::interval) d
  WHERE EXTRACT(DOW FROM d) <> 5;
$$;

-- Resolve the signed-in user from the JWT (anti-spoofing).
CREATE OR REPLACE FUNCTION la_current_user()
RETURNS la_users
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM la_users WHERE email = (auth.jwt() ->> 'email') LIMIT 1;
$$;

-- The hardcoded CEO (final approver). Change here to re-target the company CEO.
CREATE OR REPLACE FUNCTION la_ceo_email()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'faisal@test.com'::text;
$$;

CREATE OR REPLACE FUNCTION la_notify(p_user_id UUID, p_title TEXT, p_body TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO la_notifications (user_id, title, body)
  VALUES (p_user_id, p_title, p_body);
$$;

-- ---------------------------------------------------------------------------
-- 4. WORKFLOW RPCs  (all security definer; caller resolved from the JWT)
-- ---------------------------------------------------------------------------

-- 4.1 Submit a new request --------------------------------------------------
CREATE OR REPLACE FUNCTION la_submit_leave_request(
    p_leave_type   TEXT,
    p_start_date   DATE,
    p_end_date     DATE,
    p_reason       TEXT,
    p_contact      TEXT,
    p_deputy_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u  la_users%ROWTYPE;
    d  la_users%ROWTYPE;
    v_id UUID;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account. Your email is not linked to the Leave App roster.');
    END IF;

    IF p_start_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'message', 'Start date cannot be in the past.');
    END IF;
    IF p_end_date < p_start_date THEN
        RETURN jsonb_build_object('success', false, 'message', 'End date must be on or after the start date.');
    END IF;
    IF p_deputy_id IS NULL OR p_deputy_id = u.id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please pick a different colleague as your replacement.');
    END IF;

    SELECT * INTO d FROM la_users WHERE id = p_deputy_id AND status = 'active';
    IF d.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'The selected replacement is not an active team member.');
    END IF;

    v_id := gen_random_uuid();
    INSERT INTO la_leave_requests (
        id, requester_id, leave_type, start_date, end_date, days,
        reason, contact_during, deputy_id, status, history
    ) VALUES (
        v_id, u.id, p_leave_type, p_start_date, p_end_date,
        la_count_working_days(p_start_date, p_end_date),
        p_reason, p_contact, p_deputy_id, 'PENDING',
        jsonb_build_array(jsonb_build_object(
            'at', now(), 'actor', u.full_name, 'role', u.role,
            'action', 'Submitted leave request'
        ))
    );

    INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
    VALUES (v_id, 'submit', u.id, 'Submitted', p_reason);

    PERFORM la_notify(
        p_deputy_id,
        'Leave concurrence requested',
        format('%s (%s) has requested you to cover their duties for %s from %s to %s.',
               u.full_name, u.department, p_leave_type, p_start_date, p_end_date)
    );

    RETURN jsonb_build_object('success', true, 'id', v_id,
        'message', 'Leave request submitted. Awaiting your replacement''s concurrence.');
END;
$$;

-- 4.2 Deputy (replacement) decision -----------------------------------------
CREATE OR REPLACE FUNCTION la_deputy_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u  la_users%ROWTYPE;
    r  la_leave_requests%ROWTYPE;
    mgr la_users%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;

    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Request not found.'); END IF;
    IF r.status <> 'PENDING' THEN RETURN jsonb_build_object('success', false, 'message', 'This request is no longer awaiting your action.'); END IF;
    IF r.deputy_id <> u.id THEN RETURN jsonb_build_object('success', false, 'message', 'You are not the named replacement.'); END IF;

    IF NOT p_approve THEN
        UPDATE la_leave_requests
           SET status = 'REJECTED', rejection_reason = p_note, rejection_step = 'deputy',
               history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                        'action', 'Deputy declined to cover', 'note', p_note)
         WHERE id = r.id;
        INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
        VALUES (r.id, 'deputy', u.id, 'Rejected', p_note);
        PERFORM la_notify(r.requester_id, 'Deputy declined your leave',
            format('Your replacement %s declined to cover you because: %s', u.full_name, COALESCE(p_note, 'no reason given')));
        RETURN jsonb_build_object('success', true, 'message', 'Declined. The requester has been notified.');
    END IF;

    UPDATE la_leave_requests
       SET status = 'DEPUTY_CONFIRMED',
           history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                    'action', 'Deputy concurred to cover', 'note', p_note)
     WHERE id = r.id;

    INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
    VALUES (r.id, 'deputy', u.id, 'Approved', p_note);

    PERFORM la_notify(r.requester_id, 'Leave concurred',
        format('%s will cover your duties for %s.', u.full_name, r.leave_type));

    SELECT * INTO mgr FROM la_users WHERE id = (SELECT manager_id FROM la_users WHERE id = r.requester_id);
    IF mgr.id IS NOT NULL THEN
        PERFORM la_notify(mgr.id, 'Approval needed: ' || r.leave_type,
            format('%s requests %s leave from %s to %s. Their replacement %s has concurred.',
                   (SELECT full_name FROM la_users WHERE id = r.requester_id),
                   r.leave_type, r.start_date, r.end_date, u.full_name));
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Concurrence recorded. Request forwarded to the line manager.');
END;
$$;

-- 4.3 Line manager decision -------------------------------------------------
CREATE OR REPLACE FUNCTION la_manager_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u  la_users%ROWTYPE;
    r  la_leave_requests%ROWTYPE;
    req la_users%ROWTYPE;
    hr la_users%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;

    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Request not found.'); END IF;
    IF r.status <> 'DEPUTY_CONFIRMED' THEN RETURN jsonb_build_object('success', false, 'message', 'This request is not at the manager step.'); END IF;

    SELECT * INTO req FROM la_users WHERE id = r.requester_id;
    IF req.manager_id IS NULL OR req.manager_id <> u.id THEN
        RETURN jsonb_build_object('success', false, 'message', 'You are not the line manager for this request.');
    END IF;

    IF NOT p_approve THEN
        UPDATE la_leave_requests
           SET status = 'REJECTED', rejection_reason = p_note, rejection_step = 'manager',
               history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                        'action', 'Manager rejected', 'note', p_note)
         WHERE id = r.id;
        INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
        VALUES (r.id, 'manager', u.id, 'Rejected', p_note);
        PERFORM la_notify(r.requester_id, 'Leave rejected by your manager',
            format('Your manager %s rejected your %s request because: %s', u.full_name, r.leave_type, COALESCE(p_note, 'no reason given')));
        RETURN jsonb_build_object('success', true, 'message', 'Rejected. The employee has been notified.');
    END IF;

    UPDATE la_leave_requests
       SET status = 'MANAGER_APPROVED',
           history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                    'action', 'Manager approved', 'note', p_note)
     WHERE id = r.id;
    INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
    VALUES (r.id, 'manager', u.id, 'Approved', p_note);

    PERFORM la_notify(r.requester_id, 'Leave approved by manager',
        format('Your %s request has been approved by %s.', r.leave_type, u.full_name));

    FOR hr IN SELECT * FROM la_users WHERE role = 'hr' AND status = 'active' LOOP
        PERFORM la_notify(hr.id, 'HR review needed: ' || r.leave_type,
            format('%s requests %s leave from %s to %s. Manager approved; please check balance.',
                   req.full_name, r.leave_type, r.start_date, r.end_date));
    END LOOP;

    RETURN jsonb_build_object('success', true, 'message', 'Approved. Request forwarded to HR.');
END;
$$;

-- 4.4 HR decision (balance check) -------------------------------------------
CREATE OR REPLACE FUNCTION la_hr_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL,
    p_final_days NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u   la_users%ROWTYPE;
    r   la_leave_requests%ROWTYPE;
    req la_users%ROWTYPE;
    bal la_leave_balances%ROWTYPE;
    ceo la_users%ROWTYPE;
    v_days NUMERIC;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;
    IF u.role NOT IN ('hr', 'ceo') THEN RETURN jsonb_build_object('success', false, 'message', 'HR access required.'); END IF;

    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Request not found.'); END IF;
    IF r.status <> 'MANAGER_APPROVED' THEN RETURN jsonb_build_object('success', false, 'message', 'This request is not at the HR step.'); END IF;

    SELECT * INTO req FROM la_users WHERE id = r.requester_id;

    v_days := COALESCE(p_final_days, r.days);
    IF v_days < 0 THEN v_days := 0; END IF;

    IF NOT p_approve THEN
        UPDATE la_leave_requests
           SET status = 'REJECTED', rejection_reason = p_note, rejection_step = 'hr',
               history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                        'action', 'HR rejected', 'note', p_note)
         WHERE id = r.id;
        INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
        VALUES (r.id, 'hr', u.id, 'Rejected', p_note);
        PERFORM la_notify(r.requester_id, 'Leave rejected by HR',
            format('HR rejected your %s request because: %s', r.leave_type, COALESCE(p_note, 'no reason given')));
        RETURN jsonb_build_object('success', true, 'message', 'Rejected. The employee has been notified.');
    END IF;

    -- Hard balance guard: refuse approval if it exceeds the entitled balance.
    SELECT * INTO bal FROM la_leave_balances
     WHERE user_id = r.requester_id AND leave_type = r.leave_type
       AND year = EXTRACT(YEAR FROM r.start_date)::int;

    IF bal.id IS NOT NULL AND r.leave_type <> 'ShortPermission'
       AND (bal.used_days + v_days) > bal.entitled_days THEN
        RETURN jsonb_build_object('success', false, 'message',
            format('Insufficient balance: %s has %s/%s days of %s leave. Request needs %s days.',
                   req.full_name, bal.used_days, bal.entitled_days, r.leave_type, v_days));
    END IF;

    UPDATE la_leave_requests
       SET status = 'HR_APPROVED', days = v_days,
           history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                    'action', 'HR approved', 'note', p_note)
     WHERE id = r.id;
    INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
    VALUES (r.id, 'hr', u.id, 'Approved', COALESCE(p_note, format('Balance check passed (%s days)', v_days)));

    PERFORM la_notify(r.requester_id, 'Leave approved by HR',
        format('Your %s request passed HR balance check.', r.leave_type));

    SELECT * INTO ceo FROM la_users WHERE email = la_ceo_email();
    IF ceo.id IS NOT NULL THEN
        PERFORM la_notify(ceo.id, 'Final approval needed: ' || r.leave_type,
            format('%s requests %s leave from %s to %s (%s days). HR approved.',
                   req.full_name, r.leave_type, r.start_date, r.end_date, v_days));
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Approved. Request forwarded to the CEO for final approval.');
END;
$$;

-- 4.5 CEO final decision -----------------------------------------------------
CREATE OR REPLACE FUNCTION la_ceo_decision(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u  la_users%ROWTYPE;
    r  la_leave_requests%ROWTYPE;
    bal la_leave_balances%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;
    IF u.email <> la_ceo_email() THEN RETURN jsonb_build_object('success', false, 'message', 'CEO access required.'); END IF;

    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Request not found.'); END IF;
    IF r.status <> 'HR_APPROVED' THEN RETURN jsonb_build_object('success', false, 'message', 'This request is not at the CEO step.'); END IF;

    IF NOT p_approve THEN
        UPDATE la_leave_requests
           SET status = 'REJECTED', rejection_reason = p_note, rejection_step = 'ceo',
               history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                        'action', 'CEO rejected', 'note', p_note)
         WHERE id = r.id;
        INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
        VALUES (r.id, 'ceo', u.id, 'Rejected', p_note);
        PERFORM la_notify(r.requester_id, 'Leave rejected by CEO',
            format('The CEO rejected your %s request because: %s', r.leave_type, COALESCE(p_note, 'no reason given')));
        RETURN jsonb_build_object('success', true, 'message', 'Rejected. The employee has been notified.');
    END IF;

    UPDATE la_leave_requests
       SET status = 'APPROVED', rejection_reason = NULL, rejection_step = NULL,
           history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role,
                    'action', 'CEO approved — final', 'note', p_note)
     WHERE id = r.id;
    INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
    VALUES (r.id, 'ceo', u.id, 'Approved', p_note);

    -- Deduct balance now that the request is final.
    SELECT * INTO bal FROM la_leave_balances
     WHERE user_id = r.requester_id AND leave_type = r.leave_type
       AND year = EXTRACT(YEAR FROM r.start_date)::int;

    IF bal.id IS NOT NULL THEN
        UPDATE la_leave_balances SET used_days = used_days + r.days WHERE id = bal.id;
    ELSE
        INSERT INTO la_leave_balances (user_id, leave_type, year, entitled_days, used_days)
        VALUES (r.requester_id, r.leave_type, EXTRACT(YEAR FROM r.start_date)::int, r.days, r.days);
    END IF;

    PERFORM la_notify(r.requester_id, 'Leave approved',
        format('Congratulations! Your %s leave from %s to %s has been fully approved.',
               r.leave_type, r.start_date, r.end_date));

    RETURN jsonb_build_object('success', true, 'message', 'Approved. The leave is confirmed.');
END;
$$;

-- 4.6 Employee cancels a request ---------------------------------------------
CREATE OR REPLACE FUNCTION la_cancel_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u la_users%ROWTYPE;
    r la_leave_requests%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;

    SELECT * INTO r FROM la_leave_requests WHERE id = p_request_id;
    IF r.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Request not found.'); END IF;
    IF r.requester_id <> u.id THEN RETURN jsonb_build_object('success', false, 'message', 'Only the requester can cancel.'); END IF;
    IF r.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'This request can no longer be cancelled.');
    END IF;

    UPDATE la_leave_requests
       SET status = 'CANCELLED',
           history = r.history || jsonb_build_object('at', now(), 'actor', u.full_name, 'role', u.role, 'action', 'Cancelled')
     WHERE id = r.id;
    INSERT INTO la_approval_log (request_id, step, actor_id, action, note)
    VALUES (r.id, 'cancel', u.id, 'Cancelled', NULL);

    RETURN jsonb_build_object('success', true, 'message', 'Request cancelled.');
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. READ RPCs (all reads also go through the JWT-resolved user)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION la_my_requests()
RETURNS SETOF la_leave_requests
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT lr.* FROM la_leave_requests lr
  JOIN la_users u ON u.email = (auth.jwt() ->> 'email')
  WHERE lr.requester_id = u.id
  ORDER BY lr.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION la_team_requests()
RETURNS SETOF la_leave_requests
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT lr.* FROM la_leave_requests lr
  JOIN la_users u ON u.email = (auth.jwt() ->> 'email')
  JOIN la_users req ON req.id = lr.requester_id
  WHERE req.manager_id = u.id
  ORDER BY lr.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION la_all_requests()
RETURNS SETOF la_leave_requests
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT lr.* FROM la_leave_requests lr
  JOIN la_users u ON u.email = (auth.jwt() ->> 'email')
  WHERE u.role IN ('hr', 'ceo')
  ORDER BY lr.created_at DESC;
$$;

-- Action queue: requests waiting on THIS user at the current step.
CREATE OR REPLACE FUNCTION la_action_queue()
RETURNS TABLE(
    request_id     UUID,
    requester_name TEXT,
    requester_dept TEXT,
    requester_pos  TEXT,
    leave_type     TEXT,
    start_date     DATE,
    end_date       DATE,
    days           NUMERIC,
    reason         TEXT,
    contact_during TEXT,
    deputy_name    TEXT,
    status         TEXT,
    step           TEXT,
    requester_manager TEXT,
    created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u la_users%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        lr.id,
        req.full_name,
        req.department,
        req.position,
        lr.leave_type,
        lr.start_date,
        lr.end_date,
        lr.days,
        lr.reason,
        lr.contact_during,
        dep.full_name::text,
        lr.status,
        CASE
            WHEN lr.status = 'PENDING'          THEN 'deputy'
            WHEN lr.status = 'DEPUTY_CONFIRMED' THEN 'manager'
            WHEN lr.status = 'MANAGER_APPROVED' THEN 'hr'
            WHEN lr.status = 'HR_APPROVED'      THEN 'ceo'
            ELSE lr.status
        END,
        mgr.full_name,
        lr.created_at
    FROM la_leave_requests lr
    JOIN la_users req ON req.id = lr.requester_id
    JOIN la_users dep ON dep.id = lr.deputy_id
    LEFT JOIN la_users mgr ON mgr.id = req.manager_id
    WHERE
        (lr.status = 'PENDING'          AND lr.deputy_id = u.id)
        OR (lr.status = 'DEPUTY_CONFIRMED' AND req.manager_id = u.id)
        OR (lr.status = 'MANAGER_APPROVED' AND u.role IN ('hr', 'ceo'))
        OR (lr.status = 'HR_APPROVED'       AND u.email = la_ceo_email())
    ORDER BY lr.created_at ASC;  -- oldest first
END;
$$;

CREATE OR REPLACE FUNCTION la_my_balances()
RETURNS SETOF la_leave_balances
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.* FROM la_leave_balances b
  JOIN la_users u ON u.email = (auth.jwt() ->> 'email')
  WHERE b.user_id = u.id
  ORDER BY b.leave_type;
$$;

CREATE OR REPLACE FUNCTION la_users_directory()
RETURNS SETOF la_users
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM la_users WHERE status = 'active' ORDER BY full_name;
$$;

CREATE OR REPLACE FUNCTION la_request_detail(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u  la_users%ROWTYPE;
    lr la_leave_requests%ROWTYPE;
    re la_users%ROWTYPE;
    de la_users%ROWTYPE;
    mg la_users%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;

    SELECT * INTO lr FROM la_leave_requests WHERE id = p_request_id;
    IF lr.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Request not found.'); END IF;

    SELECT * INTO re FROM la_users WHERE id = lr.requester_id;
    SELECT * INTO de FROM la_users WHERE id = lr.deputy_id;
    SELECT * INTO mg FROM la_users WHERE id = re.manager_id;

    -- View authorization: requester, deputy, line manager, HR or CEO
    IF NOT (
        lr.requester_id = u.id OR
        lr.deputy_id = u.id OR
        mg.id = u.id OR
        u.role IN ('hr', 'ceo') OR
        u.email = la_ceo_email()
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Not authorized to view this request.');
    END IF;

    RETURN jsonb_build_object(
        'request', jsonb_build_object(
            'id', lr.id, 'leave_type', lr.leave_type, 'start_date', lr.start_date,
            'end_date', lr.end_date, 'days', lr.days, 'reason', lr.reason,
            'contact_during', lr.contact_during, 'status', lr.status,
            'rejection_reason', lr.rejection_reason, 'rejection_step', lr.rejection_step,
            'created_at', lr.created_at, 'history', lr.history
        ),
        'requester', jsonb_build_object(
            'id', re.id, 'name', re.full_name, 'department', re.department,
            'position', re.position, 'email', re.email
        ),
        'deputy', jsonb_build_object(
            'id', de.id, 'name', de.full_name, 'department', de.department
        ),
        'manager', CASE WHEN mg.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', mg.id, 'name', mg.full_name, 'department', mg.department
        ) END,
        'approvals', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'step', lg.step, 'action', lg.action, 'actor',
                COALESCE(ac.full_name, lg.actor_id::text), 'note', lg.note, 'at', lg.created_at
            ) ORDER BY lg.created_at)
            FROM la_approval_log lg LEFT JOIN la_users ac ON ac.id = lg.actor_id
            WHERE lg.request_id = lr.id
        ), '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION la_notifications()
RETURNS TABLE(
    id UUID, title TEXT, body TEXT, is_read BOOLEAN, created_at TIMESTAMPTZ,
    unread BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u la_users%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT n.id, n.title, n.body, n.is_read, n.created_at,
           (SELECT COUNT(*) FROM la_notifications n2 WHERE n2.user_id = u.id AND NOT n2.is_read) AS unread
    FROM la_notifications n
    WHERE n.user_id = u.id
    ORDER BY n.created_at DESC
    LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION la_notifications_mark_read(p_notification_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u la_users%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;

    UPDATE la_notifications SET is_read = TRUE
     WHERE id = p_notification_id AND user_id = u.id;

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION la_notifications_mark_all_read()
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u la_users%ROWTYPE;
BEGIN
    u := la_current_user();
    IF u.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Unrecognized account.'); END IF;
    UPDATE la_notifications SET is_read = TRUE WHERE user_id = u.id;
    RETURN jsonb_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. GRANTS:  functions are NOT public by default here; only authenticated.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON la_users TO authenticated;

REVOKE EXECUTE ON FUNCTION la_submit_leave_request(TEXT, DATE, DATE, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_deputy_decision(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_manager_decision(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_hr_decision(UUID, BOOLEAN, TEXT, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_ceo_decision(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_cancel_request(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_my_requests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_team_requests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_all_requests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_action_queue() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_my_balances() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_users_directory() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_request_detail(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_notifications_mark_read(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION la_notifications_mark_all_read() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION la_submit_leave_request(TEXT, DATE, DATE, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION la_deputy_decision(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION la_manager_decision(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION la_hr_decision(UUID, BOOLEAN, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION la_ceo_decision(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION la_cancel_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION la_my_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION la_team_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION la_all_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION la_action_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION la_my_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION la_users_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION la_request_detail(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION la_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION la_notifications_mark_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION la_notifications_mark_all_read() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. SEED DATA  (roster mirrors the existing Supabase Auth accounts)
--    Log in with the same emails + '12345'. Add new staff here (la_users) and
--    create the matching Supabase Auth user for them to log in.
-- ---------------------------------------------------------------------------
INSERT INTO la_users (email, full_name, role, department, position, manager_id, joined_on, status) VALUES
    ('faisal@test.com', 'Dr. Faisal Al-Sabah', 'ceo', 'Executive', 'Chief Executive Officer', NULL, '2022-01-01', 'active'),
    ('layla@test.com',  'Layla Al-Fadhli',      'hr',   'Human Resources',  'HR Manager',          NULL, '2022-02-01', 'active'),
    ('ahmed@test.com',  'Ahmed Al-Mutairi',     'manager', 'IT Services',  'IT Manager',          NULL, '2022-03-01', 'active'),
    ('sarah@test.com',  'Sarah Al-Ghanim',      'manager', 'Operations',   'Operations Manager',  NULL, '2022-04-01', 'active')
ON CONFLICT (email) DO NOTHING;

INSERT INTO la_users (email, full_name, role, department, position, manager_id, joined_on, status)
SELECT 'ihab@test.com',  'Ihab A. Harb',    'staff', 'IT Services', 'Systems Engineer', u1.id, '2023-01-01', 'active'
FROM la_users u1 WHERE u1.email = 'sarah@test.com'
ON CONFLICT (email) DO NOTHING;

INSERT INTO la_users (email, full_name, role, department, position, manager_id, joined_on, status)
SELECT 'john@test.com',  'John Doe',        'staff', 'Operations',  'Coordinator',      u1.id, '2023-02-01', 'active'
FROM la_users u1 WHERE u1.email = 'sarah@test.com'
ON CONFLICT (email) DO NOTHING;

INSERT INTO la_users (email, full_name, role, department, position, manager_id, joined_on, status)
SELECT 'mohamed@test.com', 'Mohamed Ahmed Ali', 'staff', 'IT Services', 'Support Analyst', u1.id, '2024-01-01', 'active'
FROM la_users u1 WHERE u1.email = 'ahmed@test.com'
ON CONFLICT (email) DO NOTHING;

-- Annual/Sick/Emergency/ShortPermission balances for 2026
INSERT INTO la_leave_balances (user_id, leave_type, year, entitled_days, used_days)
SELECT u.id, t.leave_type, 2026, t.entitled, 0
FROM la_users u
CROSS JOIN (VALUES ('Annual', 30), ('Sick', 15), ('Emergency', 6), ('ShortPermission', 16)) AS t(leave_type, entitled)
ON CONFLICT (user_id, leave_type, year) DO NOTHING;