
-- 1. Create Role Permissions Table
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role TEXT NOT NULL,
    view_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(role, view_id)
);

-- 2. Seed with current defaults from Sidebar.tsx
INSERT INTO role_permissions (role, view_id) VALUES
('Admin', 'dashboard'), ('Manager', 'dashboard'), ('HR', 'dashboard'), ('Mandoob', 'dashboard'),
('Admin', 'admin-center'), ('HR', 'admin-center'),
('Admin', 'mandoob'), ('HR', 'mandoob'), ('Mandoob', 'mandoob'),
('Employee', 'profile'), ('Manager', 'profile'), ('Admin', 'profile'), ('HR', 'profile'),
('Employee', 'attendance'), ('Manager', 'attendance'), ('Admin', 'attendance'), ('HR', 'attendance'),
('Admin', 'leaves'), ('Manager', 'leaves'), ('Employee', 'leaves'), ('HR', 'leaves'),
('Admin', 'directory'), ('Manager', 'directory'), ('HR', 'directory'),
('Admin', 'payroll'), ('HR', 'payroll'),
('Admin', 'settlement'), ('HR', 'settlement'),
('Admin', 'finance'), ('HR', 'finance'),
('Admin', 'management'), ('Executive', 'management'), ('Manager', 'management'), ('HR', 'management'), ('HR Manager', 'management'), ('HR Officer', 'management'), ('Payroll Manager', 'management'),
('Admin', 'insights'), ('Manager', 'insights'), ('HR', 'insights'),
('Admin', 'compliance'), ('HR', 'compliance'),
('Admin', 'whitepaper'), ('HR', 'whitepaper'),
('Admin', 'user-management')
ON CONFLICT DO NOTHING;

-- 3. Access control
ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE role_permissions TO anon, authenticated, service_role;
