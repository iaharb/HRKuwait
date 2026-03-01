
-- 1. Create User System Table
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, 
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    role TEXT NOT NULL, -- Admin, HR Officer, HR Manager, Payroll Officer, Payroll Manager, etc.
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Disable RLS for now to ensure connectivity
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE app_users TO anon, authenticated, service_role;

-- 3. Seed a Master Admin (Separate from employees)
INSERT INTO app_users (username, password, role)
VALUES ('superadmin', 'admin@2026', 'Admin')
ON CONFLICT (username) DO NOTHING;

-- 4. Seed logins for existing key employees
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM employees WHERE name = 'Dr. Faisal Al-Sabah') THEN
        INSERT INTO app_users (username, password, role, employee_id)
        SELECT 'faisal', '12345', 'Admin', id FROM employees WHERE name = 'Dr. Faisal Al-Sabah'
        ON CONFLICT (username) DO NOTHING;
    END IF;

    IF EXISTS (SELECT 1 FROM employees WHERE name = 'Layla Al-Fadhli') THEN
        INSERT INTO app_users (username, password, role, employee_id)
        SELECT 'layla', '12345', 'HR Manager', id FROM employees WHERE name = 'Layla Al-Fadhli'
        ON CONFLICT (username) DO NOTHING;
    END IF;
END $$;
