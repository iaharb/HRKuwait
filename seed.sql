
-- 1. TRUNCATE CURRENT DATA
TRUNCATE employees, leave_requests, attendance, payroll_runs, payroll_items CASCADE;

-- 2. SEED EMPLOYEES
INSERT INTO employees (id, name, name_arabic, nationality, civil_id, civil_id_expiry, passport_number, passport_expiry, department, department_arabic, position, position_arabic, join_date, salary, status, work_days_per_week, iban, bank_code, allowances)
VALUES 
('00000000-0000-0000-0000-000000000001', 'Dr. Faisal Al-Sabah', 'د. فيصل الصباح', 'Kuwaiti', '280010101111', '2028-12-31', 'K0000001', '2030-01-01', 'Executive', 'الإدارة التنفيذية', 'CEO', 'الرئيس التنفيذي', '2015-01-01', 7500, 'Active', 5, 'KW51NBK00000012345678901111', 'NBK', '[{"id":"a1","name":"Housing","nameArabic":"بدل سكن","type":"Fixed","value":1000,"isHousing":true}]'),
('00000000-0000-0000-0000-000000000002', 'Layla Al-Fadhli', 'ليلى الفضلي', 'Kuwaiti', '290031202222', '2027-05-20', 'K0000002', '2029-01-01', 'HR', 'الموارد البشرية', 'HR Manager', 'مدير الموارد البشرية', '2018-03-12', 3500, 'Active', 5, 'KW89BOUB00000055443322112222', 'BOUB', '[{"id":"a2","name":"Transport","nameArabic":"بدل انتقال","type":"Fixed","value":150,"isHousing":false}]'),
('00000000-0000-0000-0000-000000000003', 'Ahmed Al-Mutairi', 'أحمد المطيري', 'Kuwaiti', '285052003333', '2026-03-15', 'K0000003', '2026-12-31', 'IT', 'تقنية المعلومات', 'IT Lead', 'رئيس قسم التقنية', '2019-06-15', 3200, 'Active', 5, 'KW22KFH00000098765432103333', 'KFH', '[{"id":"a3","name":"Technical","nameArabic":"علاوة فنية","type":"Percentage","value":10,"isHousing":false}]'),
('00000000-0000-0000-0000-000000000004', 'Sarah Al-Ghanim', 'سارة الغانم', 'Kuwaiti', '295052004444', '2027-10-10', 'K0000004', '2028-01-01', 'IT', 'تقنية المعلومات', 'Senior Developer', 'مطور أقدم', '2021-05-20', 2200, 'Active', 5, 'KW44GULF00000066778899004444', 'GULF', '[]'),
('00000000-0000-0000-0000-000000000005', 'John Doe', 'جون دو', 'Expat', '289031505555', '2026-03-15', 'P5000001', '2026-03-10', 'IT', 'تقنية المعلومات', 'Network Engineer', 'مهندس شبكات', '2022-03-15', 1800, 'Active', 6, 'KW51NBK00000011223344555555', 'NBK', '[{"id":"a4","name":"Housing","nameArabic":"بدل سكن","type":"Fixed","value":300,"isHousing":true}]');

-- 3. SEED LEAVES (JAN 2026)
INSERT INTO leave_requests (id, employee_id, employee_name, department, type, start_date, end_date, days, status, reason, created_at, manager_id)
VALUES 
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Dr. Faisal Al-Sabah', 'Executive', 'Annual', '2026-01-11', '2026-01-15', 5, 'HR_Finalized', 'Annual Vacation', '2026-01-01T10:00:00Z', '00000000-0000-0000-0000-000000000001'),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000002', 'Layla Al-Fadhli', 'HR', 'Annual', '2026-01-18', '2026-01-22', 5, 'HR_Finalized', 'Family Event', '2026-01-05T09:00:00Z', '00000000-0000-0000-0000-000000000001'),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000003', 'Ahmed Al-Mutairi', 'IT', 'Sick', '2026-01-04', '2026-01-07', 4, 'HR_Finalized', 'Flu', '2026-01-04T07:00:00Z', '00000000-0000-0000-0000-000000000001');

-- 4. SEED ATTENDANCE
INSERT INTO attendance (employee_id, employee_name, date, clock_in, clock_out, location, status, source)
SELECT e.id, e.name, d::date, '07:30:00'::time, '15:30:00'::time, 'HQ Tower', 'On-Site', 'Hardware'
FROM employees e CROSS JOIN generate_series('2026-01-01'::date, '2026-01-31'::date, '1 day'::interval) d
WHERE EXTRACT(DOW FROM d) != 5;
