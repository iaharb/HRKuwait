
-- 017_comprehensive_rls_policies.sql
-- Enterprise-Ready Role Based Access Control (RBAC) via RLS

-- 1. IDENTITY HELPERS
-- These functions abstract away the JWT extraction, making it easy to swap 
-- between 'Fake Auth' and 'Supabase Auth' later.
CREATE OR REPLACE FUNCTION get_my_id() 
RETURNS UUID AS $$
  -- Checks if someone is using a session variable (manual override) or standard JWT
  SELECT COALESCE(
    NULLIF(current_setting('app.current_user_id', true), '')::UUID,
    (auth.jwt() -> 'user_metadata' ->> 'employee_id')::UUID
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_my_role() 
RETURNS TEXT AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_role', true), ''),
    (auth.jwt() -> 'user_metadata' ->> 'role')
  );
$$ LANGUAGE sql STABLE;

-- 2. CLEAR EXISTING BROAD POLICIES
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Full Access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Admin Full Access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Manager Access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Self Access" ON %I', t);
    END LOOP;
END $$;

-- 3. APPLY ROLE-BASED POLICIES

-- ==========================================
-- EMPLOYEES TABLE
-- ==========================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin & HR: Full Access" ON employees 
FOR ALL TO authenticated, anon 
USING (get_my_role() IN ('Admin', 'HR Manager', 'HR Officer'));

CREATE POLICY "Manager: View Subordinates" ON employees 
FOR SELECT TO authenticated, anon 
USING (manager_id = get_my_id() OR id = get_my_id());

CREATE POLICY "Employee: View Self" ON employees 
FOR SELECT TO authenticated, anon 
USING (id = get_my_id());

-- ==========================================
-- LEAVE REQUESTS TABLE
-- ==========================================
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR: Full Access" ON leave_requests 
FOR ALL TO authenticated, anon 
USING (get_my_role() IN ('Admin', 'HR Manager', 'HR Officer'));

CREATE POLICY "Manager: View & Approve Subordinates" ON leave_requests 
FOR ALL TO authenticated, anon 
USING (
  employee_id IN (SELECT id FROM employees WHERE manager_id = get_my_id())
);

CREATE POLICY "Employee: Manage Own Leaves" ON leave_requests 
FOR ALL TO authenticated, anon 
USING (employee_id = get_my_id());

-- ==========================================
-- PAYROLL TABLES
-- ==========================================
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll/Admin: Full Access" ON payroll_runs 
FOR ALL TO authenticated, anon 
USING (get_my_role() IN ('Admin', 'Payroll Manager', 'Payroll Officer', 'HR Manager'));

CREATE POLICY "Payroll/Admin: Full Access items" ON payroll_items 
FOR ALL TO authenticated, anon 
USING (get_my_role() IN ('Admin', 'Payroll Manager', 'Payroll Officer', 'HR Manager'));

CREATE POLICY "Employee: View Own Payslips" ON payroll_items 
FOR SELECT TO authenticated, anon 
USING (employee_id = get_my_id());

-- ==========================================
-- ANNOUNCEMENTS & PUBLIC DATA
-- ==========================================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone: Read Announcements" ON announcements FOR SELECT USING (true);
CREATE POLICY "Admin: Manage Announcements" ON announcements FOR ALL USING (get_my_role() = 'Admin');

CREATE POLICY "Everyone: Read Holidays" ON public_holidays FOR SELECT USING (true);
CREATE POLICY "Everyone: Read Office" ON office_locations FOR SELECT USING (true);

-- ==========================================
-- USER MANAGEMENT (SENSITIVE)
-- ==========================================
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- ONLY Admin can see or edit users
CREATE POLICY "Admin: Manage Users" ON app_users 
FOR ALL TO authenticated, anon 
USING (get_my_role() = 'Admin');

-- Users can see their own login record
CREATE POLICY "User: View Own Record" ON app_users 
FOR SELECT TO authenticated, anon 
USING (id = get_my_id() OR employee_id = get_my_id());

-- 4. REFRESH PERMISSIONS
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
