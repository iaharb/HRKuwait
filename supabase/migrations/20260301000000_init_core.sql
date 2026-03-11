-- RECONSTRUCTED CORE SCHEMA
-- These tables were originally created in the Supabase UI and are not in migrations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. EMPLOYEES
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    nationality TEXT,
    civil_id TEXT,
    civil_id_expiry DATE,
    passport_number TEXT,
    passport_expiry DATE,
    department TEXT,
    position TEXT,
    join_date DATE,
    salary NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Active',
    work_days_per_week INTEGER DEFAULT 5,
    iban TEXT,
    bank_code TEXT,
    allowances JSONB DEFAULT '[]',
    leave_balances JSONB DEFAULT '{}',
    role TEXT DEFAULT 'Employee',
    last_reset_year INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. LEAVE REQUESTS
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    employee_name TEXT,
    department TEXT,
    type TEXT,
    start_date DATE,
    end_date DATE,
    days NUMERIC,
    duration_hours NUMERIC,
    status TEXT DEFAULT 'Pending',
    reason TEXT,
    manager_id UUID REFERENCES employees(id),
    actual_return_date DATE,
    medical_certificate_url TEXT,
    history JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    employee_name TEXT,
    date DATE NOT NULL,
    clock_in TIME,
    clock_out TIME,
    location TEXT,
    location_arabic TEXT,
    status TEXT, -- 'On-Site', 'Remote', etc.
    source TEXT,
    lat NUMERIC,
    lng NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. APP USERS (System users for login)
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    employee_id UUID REFERENCES employees(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. LEGACY TABLES (Required for Migration Compatibility)
CREATE TABLE IF NOT EXISTS department_configs (
    dept_name TEXT PRIMARY KEY,
    target_ratio NUMERIC,
    headcount_goal INTEGER,
    manager_id UUID REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS department_metrics (
    name TEXT PRIMARY KEY,
    name_arabic TEXT,
    kuwaiti_count INTEGER,
    expat_count INTEGER,
    target_ratio NUMERIC
);
