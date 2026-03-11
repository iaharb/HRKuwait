
-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. BRIDGE FUNCTION (Required for Admin Terminal)
CREATE OR REPLACE FUNCTION run_sql(sql_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_query;
END;
$$;

-- 2.5 LEAVE REQUESTS CONSTRAINT UPDATE
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check 
CHECK (status IN ('Pending', 'Manager_Approved', 'HR_Approved', 'HR_Finalized', 'Rejected', 'Paid', 'Pushed_To_Payroll'));

-- 3. ENHANCE EMPLOYEES
ALTER TABLE employees ADD COLUMN IF NOT EXISTS name_arabic TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_arabic TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_arabic TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS face_token TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS device_user_id TEXT;


-- 4. OFFICE LOCATIONS BILINGUAL
CREATE TABLE IF NOT EXISTS office_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    name_arabic TEXT,
    address TEXT,
    address_arabic TEXT,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    radius INTEGER DEFAULT 250,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. PUBLIC HOLIDAYS BILINGUAL
CREATE TABLE IF NOT EXISTS public_holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    name_arabic TEXT,
    date DATE NOT NULL,
    type TEXT,
    is_fixed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. DEPARTMENT METRICS BILINGUAL
CREATE TABLE IF NOT EXISTS department_metrics (
    name TEXT PRIMARY KEY,
    name_arabic TEXT,
    kuwaiti_count INTEGER DEFAULT 0,
    expat_count INTEGER DEFAULT 0,
    target_ratio NUMERIC DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. RECONSTRUCT ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    title_arabic TEXT,
    content TEXT NOT NULL,
    content_arabic TEXT,
    priority TEXT DEFAULT 'Normal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. PAYROLL INFRASTRUCTURE
CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_key TEXT NOT NULL UNIQUE, 
    cycle_type TEXT,
    status TEXT DEFAULT 'Draft',
    total_disbursement NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS payroll_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id),
    employee_name TEXT,
    basic_salary NUMERIC NOT NULL DEFAULT 0,
    housing_allowance NUMERIC DEFAULT 0,
    other_allowances NUMERIC DEFAULT 0,
    leave_deductions NUMERIC DEFAULT 0,
    short_permission_deductions NUMERIC DEFAULT 0,
    pifss_deduction NUMERIC DEFAULT 0,
    pifss_employer_share NUMERIC DEFAULT 0,
    net_salary NUMERIC NOT NULL DEFAULT 0,
    verified_by_hr BOOLEAN DEFAULT FALSE,
    variance NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 9. REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- 10. PERMISSIONS
ALTER TABLE payroll_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE office_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE department_metrics DISABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
