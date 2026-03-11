
-- Migration 009: Permission Templates (Updated with ESS Core)
-- This script updates the available templates to ensure all roles have Self-Service access.

CREATE TABLE IF NOT EXISTS permission_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name TEXT UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL, -- Map of ViewID -> Boolean
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Seed/Update Templates
INSERT INTO permission_templates (template_name, description, permissions) VALUES
('Super Admin', 'Full access to all system modules and security settings.', '{"dashboard": true, "admin-center": true, "mandoob": true, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": true, "settlement": true, "finance": true, "management": true, "insights": true, "compliance": true, "whitepaper": true, "user-management": true}'),
('HR Manager', 'Comprehensive HR management access excluding security.', '{"dashboard": true, "admin-center": true, "mandoob": true, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": false, "settlement": true, "finance": false, "management": true, "insights": true, "compliance": true, "whitepaper": true, "user-management": false}'),
('Payroll Manager', 'Dedicated access to financial and payroll processing modules.', '{"dashboard": true, "admin-center": false, "mandoob": false, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": true, "settlement": true, "finance": true, "management": false, "insights": true, "compliance": false, "whitepaper": false, "user-management": false}'),
('Dept Manager', 'Department-level management focusing on team operations.', '{"dashboard": true, "admin-center": false, "mandoob": false, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": false, "settlement": false, "finance": false, "management": true, "insights": true, "compliance": false, "whitepaper": false, "user-management": false}'),
('Executive', 'Strategic overview and high-level insights.', '{"dashboard": true, "admin-center": false, "mandoob": false, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": false, "settlement": false, "finance": false, "management": true, "insights": true, "compliance": true, "whitepaper": true, "user-management": false}'),
('Standard Employee', 'Basic access to personal tools and company directory.', '{"dashboard": true, "admin-center": false, "mandoob": false, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": false, "settlement": false, "finance": false, "management": false, "insights": false, "compliance": false, "whitepaper": false, "user-management": false}')
ON CONFLICT (template_name) DO UPDATE SET permissions = EXCLUDED.permissions;

-- Force Cache Reload
NOTIFY pgrst, 'reload schema';

-- Ensure RLS is handled
ALTER TABLE permission_templates DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE permission_templates TO anon, authenticated, service_role;
