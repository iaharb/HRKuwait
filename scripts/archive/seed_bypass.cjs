
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8') + '\n' + fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL="(https:\/\/[^"]+)"/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);

if (!urlMatch || !keyMatch) {
    console.error('Missing Supabase Config');
    process.exit(1);
}

const url = urlMatch[1];
const key = keyMatch[1];
const supabase = createClient(url, key);

const sql = `
-- Create company_settings if missing
CREATE TABLE IF NOT EXISTS company_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT NOT NULL,
    mol_id TEXT,
    employer_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed company_settings
INSERT INTO company_settings (company_name, mol_id, employer_id)
VALUES ('ENTERPRISE WORKFORCE SOLUTIONS', 'MOL-123456', 'EMP-7890')
ON CONFLICT DO NOTHING;

-- Seed Employees with IBANs and Bank Codes
INSERT INTO employees (id, name, name_arabic, nationality, civil_id, civil_id_expiry, department, position, join_date, salary, status, work_days_per_week, iban, bank_code, allowances, leave_balances)
VALUES 
('00000000-0000-0000-0000-000000000001', 'Dr. Faisal Al-Sabah', 'د. فيصل الصباح', 'Kuwaiti', '280010101111', '2028-12-31', 'Executive', 'CEO', '2015-01-01', 7500, 'Active', 5, 'KW51NBK00000012345678901111', 'NBK', '[]', '{"annual": 30}'),
('00000000-0000-0000-0000-000000000002', 'Layla Al-Fadhli', 'ليلى الفضلي', 'Kuwaiti', '290031202222', '2027-05-20', 'HR', 'HR Manager', '2018-03-12', 3500, 'Active', 5, 'KW89BOUB00000055443322112222', 'BOUB', '[]', '{"annual": 30}'),
('00000000-0000-0000-0000-000000000003', 'Ahmed Al-Mutairi', 'أحمد المطيري', 'Kuwaiti', '285052003333', '2026-03-15', 'IT', 'IT Lead', '2019-06-15', 3200, 'Active', 5, 'KW22KFH00000098765432103333', 'KFH', '[]', '{"annual": 30}'),
('00000000-0000-0000-0000-000000000004', 'Sarah Al-Ghanim', 'سارة الغانم', 'Kuwaiti', '295052004444', '2027-10-10', 'IT', 'Senior Developer', '2021-05-20', 2200, 'Active', 5, 'KW44GULF00000066778899004444', 'GULF', '[]', '{"annual": 30}'),
('00000000-0000-0000-0000-000000000005', 'John Doe', 'جون دو', 'Expat', '289031505555', '2026-03-15', 'IT', 'Network Engineer', '2022-03-15', 1800, 'Active', 6, 'KW51NBK00000011223344555555', 'NBK', '[]', '{"annual": 30}')
ON CONFLICT (id) DO UPDATE SET
  iban = EXCLUDED.iban,
  bank_code = EXCLUDED.bank_code,
  civil_id = EXCLUDED.civil_id;

-- Seed Payroll Run
INSERT INTO payroll_runs (id, period_key, cycle_type, status, total_disbursement)
VALUES ('00000000-0000-0000-0000-000000000123', 'FEB-2026', 'Monthly', 'Locked', 18200)
ON CONFLICT (period_key) DO NOTHING;

-- Seed Payroll Items
INSERT INTO payroll_items (run_id, employee_id, employee_name, basic_salary, net_salary, verified_by_hr)
SELECT '00000000-0000-0000-0000-000000000123', id, name, salary, salary, true
FROM employees
WHERE id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;
`;

async function seed() {
    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('Staging DB successfully hydrated for WPS testing.');
    }
}

seed();
