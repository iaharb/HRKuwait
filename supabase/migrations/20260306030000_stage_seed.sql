-- STAGING SEED DATA
-- Hydrates the fresh staging project with testing data.

-- 1. SEED EMPLOYEES
INSERT INTO employees (id, name, name_arabic, nationality, civil_id, civil_id_expiry, passport_number, passport_expiry, department, position, join_date, salary, status, work_days_per_week, iban, bank_code, allowances, leave_balances)
VALUES 
('00000000-0000-0000-0000-000000000001', 'Dr. Faisal Al-Sabah', 'د. فيصل الصباح', 'Kuwaiti', '280010101111', '2028-12-31', 'K0000001', '2030-01-01', 'Executive', 'CEO', '2015-01-01', 7500, 'Active', 5, 'KW51NBK00000012345678901111', 'NBK', '[{"id":"a1","name":"Housing","nameArabic":"بدل سكن","type":"Fixed","value":1000,"isHousing":true}]', '{"annual": 30, "sick": 15, "emergency": 6}'),
('00000000-0000-0000-0000-000000000002', 'Layla Al-Fadhli', 'ليلى الفضلي', 'Kuwaiti', '290031202222', '2027-05-20', 'K0000002', '2029-01-01', 'HR', 'HR Manager', '2018-03-12', 3500, 'Active', 5, 'KW89BOUB00000055443322112222', 'BOUB', '[{"id":"a2","name":"Transport","nameArabic":"بدل انتقال","type":"Fixed","value":150,"isHousing":false}]', '{"annual": 30, "sick": 15, "emergency": 6}'),
('00000000-0000-0000-0000-000000000003', 'Ahmed Al-Mutairi', 'أحمد المطيري', 'Kuwaiti', '285052003333', '2026-03-15', 'K0000003', '2026-12-31', 'IT', 'IT Lead', '2019-06-15', 3200, 'Active', 5, 'KW22KFH00000098765432103333', 'KFH', '[{"id":"a3","name":"Technical","nameArabic":"علاوة فنية","type":"Percentage","value":10,"isHousing":false}]', '{"annual": 30, "sick": 15, "emergency": 6}'),
('00000000-0000-0000-0000-000000000004', 'Sarah Al-Ghanim', 'سارة الغانم', 'Kuwaiti', '295052004444', '2027-10-10', 'K0000004', '2028-01-01', 'IT', 'Senior Developer', '2021-05-20', 2200, 'Active', 5, 'KW44GULF00000066778899004444', 'GULF', '[]', '{"annual": 30, "sick": 15, "emergency": 6}'),
('00000000-0000-0000-0000-000000000005', 'John Doe', 'جون دو', 'Expat', '289031505555', '2026-03-15', 'P5000001', '2026-03-10', 'IT', 'Network Engineer', '2022-03-15', 1800, 'Active', 6, 'KW51NBK00000011223344555555', 'NBK', '[{"id":"a4","name":"Housing","nameArabic":"بدل سكن","type":"Fixed","value":300,"isHousing":true}]', '{"annual": 30, "sick": 15, "emergency": 6}')
ON CONFLICT (id) DO NOTHING;

-- 2. SEED DEPARTMENTS (Merged with metric info)
INSERT INTO departments (name, name_arabic, target_ratio, kuwaiti_count, expat_count, headcount_goal)
VALUES 
('Executive', 'الإدارة التنفيذية', 100, 1, 0, 5),
('HR', 'الموارد البشرية', 100, 1, 0, 10),
('IT', 'تقنية المعلومات', 75, 2, 1, 20),
('Finance', 'الشؤون المالية', 30, 0, 0, 5)
ON CONFLICT (name) DO NOTHING;

-- 3. SEED SYSTEM USERS
INSERT INTO app_users (username, password, role, employee_id)
VALUES 
('admin', 'admin@2026', 'Admin', '00000000-0000-0000-0000-000000000001'),
('hr', '12345', 'HR', '00000000-0000-0000-0000-000000000002'),
('it_lead', '12345', 'Manager', '00000000-0000-0000-0000-000000000003')
ON CONFLICT (username) DO NOTHING;

-- 4. FINANCE SEED (Rules & Accounts)
-- (Accounts already seeded in finance_core migration, here we add rules)
DO $$ 
DECLARE
    sal_exp UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600100');
    house_exp UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600200');
    allow_exp UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '600300');
    net_pay UUID := (SELECT id FROM finance_chart_of_accounts WHERE account_code = '200100');
BEGIN
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, gl_account_id, credit_or_debit)
    VALUES 
        ('Basic Salary DR', 'basic_salary', 'ALL', sal_exp, 'DR'),
        ('Housing Allowance DR', 'housing_allowance', 'ALL', house_exp, 'DR'),
        ('Other Allowances DR', 'other_allowances', 'ALL', allow_exp, 'DR'),
        ('Net Salary CR', 'net_salary', 'ALL', net_pay, 'CR')
    ON CONFLICT DO NOTHING;
END $$;

-- 5. HYDRATE NORMALIZED BALANCES
INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT id, 'Annual', 30, 0, 2026 FROM employees ON CONFLICT DO NOTHING;
INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT id, 'Sick', 15, 0, 2026 FROM employees ON CONFLICT DO NOTHING;
INSERT INTO leave_balances (employee_id, leave_type, entitled_days, used_days, year)
SELECT id, 'Emergency', 6, 0, 2026 FROM employees ON CONFLICT DO NOTHING;

-- 6. HYDRATE NORMALIZED ALLOWANCES
INSERT INTO employee_allowances (employee_id, name, name_arabic, type, value, is_housing)
SELECT
    e.id,
    elem->>'name',
    elem->>'nameArabic',
    COALESCE(elem->>'type', 'Fixed'),
    COALESCE((elem->>'value')::numeric, 0),
    COALESCE((elem->>'isHousing')::boolean, false)
FROM employees e, jsonb_array_elements(e.allowances) AS elem
ON CONFLICT DO NOTHING;
