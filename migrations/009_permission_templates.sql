
-- Migration 009: Permission Templates
-- This script creates a templates table for role permissions to simplify setup.

CREATE TABLE IF NOT EXISTS permission_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name TEXT UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL, -- Map of ViewID -> Boolean
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Seed Templates (matching View enum in types.ts)
INSERT INTO permission_templates (template_name, description, permissions) VALUES
('Super Admin', 'Full access to all system modules and security settings.', '{
    "dashboard": true,
    "admin-center": true,
    "mandoob": true,
    "profile": true,
    "attendance": true,
    "leaves": true,
    "directory": true,
    "payroll": true,
    "settlement": true,
    "finance": true,
    "management": true,
    "insights": true,
    "compliance": true,
    "whitepaper": true,
    "user-management": true
}'),
('HR Manager', 'Comprehensive HR management access excluding system security.', '{
    "dashboard": true,
    "admin-center": true,
    "mandoob": true,
    "profile": true,
    "attendance": true,
    "leaves": true,
    "directory": true,
    "payroll": false,
    "settlement": true,
    "finance": false,
    "management": true,
    "insights": true,
    "compliance": true,
    "whitepaper": true,
    "user-management": false
}'),
('Payroll Manager', 'Dedicated access to financial and payroll processing modules.', '{
    "dashboard": true,
    "admin-center": false,
    "mandoob": false,
    "profile": true,
    "attendance": true,
    "leaves": false,
    "directory": true,
    "payroll": true,
    "settlement": true,
    "finance": true,
    "management": false,
    "insights": true,
    "compliance": false,
    "whitepaper": false,
    "user-management": false
}'),
('Executive', 'Strategic overview and high-level insights.', '{
    "dashboard": true,
    "admin-center": false,
    "mandoob": false,
    "profile": true,
    "attendance": false,
    "leaves": false,
    "directory": true,
    "payroll": false,
    "settlement": false,
    "finance": false,
    "management": true,
    "insights": true,
    "compliance": true,
    "whitepaper": true,
    "user-management": false
}'),
('Standard Employee', 'Basic access to personal tools and company directory.', '{
    "dashboard": false,
    "admin-center": false,
    "mandoob": false,
    "profile": true,
    "attendance": true,
    "leaves": true,
    "directory": true,
    "payroll": false,
    "settlement": false,
    "finance": false,
    "management": false,
    "insights": false,
    "compliance": false,
    "whitepaper": false,
    "user-management": false
}');

-- Ensure RLS is handled
ALTER TABLE permission_templates DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE permission_templates TO anon, authenticated, service_role;
