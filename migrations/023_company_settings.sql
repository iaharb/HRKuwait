
-- 1. Create company_settings table
CREATE TABLE IF NOT EXISTS company_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT NOT NULL,
    mol_id TEXT,
    employer_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Grant permissions
GRANT ALL ON company_settings TO anon, authenticated, service_role;

-- 3. Initial Seed
INSERT INTO company_settings (company_name, mol_id, employer_id)
VALUES ('ENTERPRISE WORKFORCE SOLUTIONS', 'MOL-123456', 'EMP-7890')
ON CONFLICT DO NOTHING;

-- 4. Reload Schema
NOTIFY pgrst, 'reload schema';
