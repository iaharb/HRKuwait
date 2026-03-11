-- 019_production_lockdown.sql
-- SECURING THE ENTERPRISE HR PORTAL
-- This script removes all "Bootstrap" (Anonymous) backdoors and enforces strict, role-based RLS.

-- 1. CLEANUP: Purge all "Everyone" / "Bootstrap" policies
DO $$ 
DECLARE 
    t text;
BEGIN
    -- Only target BASE TABLES, because VIEWS do not support RLS directly
    FOR t IN SELECT table_name FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Leaves" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Leaves Hist" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Payroll" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Payroll Items" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Finance" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Finance CC" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Finance Rules" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Finance JV" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Claims" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Claims Hist" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Perms" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Templates" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Bootstrap Users" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Read Basic List" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Read Office" ON %I', t);
        
        -- Clear New Production Policies (for re-runs)
        EXECUTE format('DROP POLICY IF EXISTS "Emp: View Own Record" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Manager: View Direct Team" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Admin: Full Access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Emp: View Own Allowances" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Admin: Manage All Allowances" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Emp: View/Create Own Leaves" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Manager: Manage Team Leaves" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Emp: View Own Balances" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Admin: Manage All Balances" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Emp: View Own Leave History" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Admin: Full Leave History" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Emp: View Own Payslips" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Finance: Payroll Management" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Finance: Payroll Item Access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Emp: View/Clock Own Attendance" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Admin: Manage Attendance" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Finance: JV Access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Finance: Chart of Accounts" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Finance: Manage Rules" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Emp: Manage Own Claims" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Management: Approve Claims" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: View Announcements" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Admin: Manage Announcements" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: View Public Data" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: View Holidays" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: View Office Locations" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Read Nav Permissions" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Everyone: Read Templates" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Admin: Manage Access Control" ON %I', t);
    END LOOP;
END $$;

-- 2. ENSURE RLS IS ACTIVE ON ALL TABLES
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- 3. ESTABLISH SECURE PRODUCTION POLICIES

-- [EMPLOYEES & ALLOWANCES]
CREATE POLICY "Emp: View Own Record" ON employees FOR SELECT TO authenticated USING (id::text = get_my_id()::text);
CREATE POLICY "Manager: View Direct Team" ON employees FOR SELECT TO authenticated USING (manager_id::text = get_my_id()::text);
CREATE POLICY "Admin: Full Access" ON employees FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'HR Manager', 'HR Officer'));

CREATE POLICY "Emp: View Own Allowances" ON employee_allowances FOR SELECT TO authenticated USING (employee_id::text = get_my_id()::text);
CREATE POLICY "Admin: Manage All Allowances" ON employee_allowances FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'HR Manager', 'Payroll Manager'));

-- [LEAVES & BALANCES]
CREATE POLICY "Emp: View/Create Own Leaves" ON leave_requests FOR ALL TO authenticated USING (employee_id::text = get_my_id()::text);
CREATE POLICY "Manager: Manage Team Leaves" ON leave_requests FOR ALL TO authenticated USING (
    get_my_role() IN ('Admin', 'HR Manager', 'HR Officer') OR 
    manager_id::text = get_my_id()::text
);

CREATE POLICY "Emp: View Own Balances" ON leave_balances FOR SELECT TO authenticated USING (employee_id::text = get_my_id()::text);
CREATE POLICY "Admin: Manage All Balances" ON leave_balances FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'HR Manager'));

CREATE POLICY "Emp: View Own Leave History" ON leave_history FOR SELECT TO authenticated USING (
    leave_request_id IN (SELECT id FROM leave_requests WHERE employee_id::text = get_my_id()::text)
);
CREATE POLICY "Admin: Full Leave History" ON leave_history FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'HR Manager'));

-- [PAYROLL RUNS & ITEMS]
CREATE POLICY "Emp: View Own Payslips" ON payroll_items FOR SELECT TO authenticated USING (employee_id::text = get_my_id()::text);
CREATE POLICY "Finance: Payroll Management" ON payroll_runs FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'Payroll Manager', 'HR Manager'));
CREATE POLICY "Finance: Payroll Item Access" ON payroll_items FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'Payroll Manager', 'HR Manager'));

-- [ATTENDANCE]
CREATE POLICY "Emp: View/Clock Own Attendance" ON attendance FOR ALL TO authenticated USING (employee_id::text = get_my_id()::text);
CREATE POLICY "Admin: Manage Attendance" ON attendance FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'HR Manager', 'HR Officer'));

-- [FINANCE & JV]
CREATE POLICY "Finance: JV Access" ON journal_entries FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'Payroll Manager', 'Executive'));
CREATE POLICY "Finance: Chart of Accounts" ON finance_chart_of_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Finance: Manage Rules" ON finance_mapping_rules FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'Payroll Manager'));
CREATE POLICY "Finance: Manage CC" ON finance_cost_centers FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'Payroll Manager'));

-- [EXPENSE CLAIMS]
CREATE POLICY "Emp: Manage Own Claims" ON expense_claims FOR ALL TO authenticated USING (employee_id::text = get_my_id()::text);
CREATE POLICY "Management: Approve Claims" ON expense_claims FOR ALL TO authenticated USING (get_my_role() IN ('Admin', 'HR Manager', 'Payroll Manager', 'Executive'));

-- [META DATA & ANNOUNCEMENTS]
CREATE POLICY "Everyone: View Announcements" ON announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin: Manage Announcements" ON announcements FOR ALL TO authenticated USING (get_my_role() = 'Admin');

CREATE POLICY "Everyone: View Public Data" ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Everyone: View Holidays" ON public_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Everyone: View Office Locations" ON office_locations FOR SELECT TO authenticated USING (true);

-- [PERMISSIONS & CONFIG]
CREATE POLICY "Everyone: Read Nav Permissions" ON role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Everyone: Read Templates" ON permission_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin: Manage Access Control" ON role_permissions FOR ALL TO authenticated USING (get_my_role() = 'Admin');

-- 4. REVOKE ANONYMOUS ACCESS (THE FINAL LOCK)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Explicitly allow 'anon' to read NOTHING (except for essential metadata if required by PostgREST)
GRANT USAGE ON SCHEMA public TO anon;

-- Ensure 'authenticated' user has full operational rights on the schema
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Force Cache Reload
NOTIFY pgrst, 'reload schema';
