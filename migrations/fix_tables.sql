
-- FIX: Create missing tables from Migration 001

CREATE TABLE IF NOT EXISTS leave_balances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type      TEXT NOT NULL,
    entitled_days   NUMERIC NOT NULL DEFAULT 0,
    used_days       NUMERIC NOT NULL DEFAULT 0,
    year            INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (employee_id, leave_type, year)
);

CREATE TABLE IF NOT EXISTS employee_allowances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    name_arabic     TEXT,
    type            TEXT NOT NULL DEFAULT 'Fixed',
    value           NUMERIC NOT NULL DEFAULT 0,
    is_housing      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    name_arabic     TEXT,
    target_ratio    NUMERIC NOT NULL DEFAULT 30,
    kuwaiti_count   INTEGER NOT NULL DEFAULT 0,
    expat_count     INTEGER NOT NULL DEFAULT 0,
    headcount_goal  INTEGER,
    manager_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE leave_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_allowances DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;

GRANT ALL ON leave_balances TO anon, authenticated, service_role;
GRANT ALL ON employee_allowances TO anon, authenticated, service_role;
GRANT ALL ON departments TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
