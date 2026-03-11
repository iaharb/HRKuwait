
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Helper to read env
const env = fs.readFileSync('.env.local', 'utf8') + '\n' + fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL="(https:\/\/[^"]+)"/);
const keyMatch = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

if (!urlMatch || !keyMatch) {
    console.error('Missing Supabase Config');
    process.exit(1);
}

const url = urlMatch[1];
const key = keyMatch[1];
const supabase = createClient(url, key);

const employees = [
    {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Dr. Faisal Al-Sabah', name_arabic: 'د. فيصل الصباح',
        nationality: 'Kuwaiti', department: 'Executive', department_arabic: 'الإدارة التنفيذية',
        position: 'CEO', position_arabic: 'الرئيس التنفيذي', role: 'Admin',
        join_date: '2015-01-01', salary: 7500, status: 'Active',
        work_days_per_week: 5, civil_id: '280010101111', civil_id_expiry: '2028-12-31',
        iban: 'KW51NBK00000012345678901111', bank_code: 'NBK'
    },
    {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Layla Al-Fadhli', name_arabic: 'ليلى الفضلي',
        nationality: 'Kuwaiti', department: 'HR', department_arabic: 'الموارد البشرية',
        position: 'HR Manager', position_arabic: 'مدير الموارد البشرية', role: 'HR Manager',
        join_date: '2018-03-12', salary: 3500, status: 'Active',
        work_days_per_week: 5, civil_id: '290031202222', civil_id_expiry: '2027-05-20',
        iban: 'KW89BOUB00000055443322112222', bank_code: 'BOUB'
    },
    {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'Ahmed Al-Mutairi', name_arabic: 'أحمد المطيري',
        nationality: 'Kuwaiti', department: 'IT', department_arabic: 'تقنية المعلومات',
        position: 'IT Lead', position_arabic: 'رئيس قسم التقنية', role: 'Manager',
        join_date: '2019-06-15', salary: 3200, status: 'Active',
        work_days_per_week: 5, civil_id: '285052003333', civil_id_expiry: '2026-03-15',
        iban: 'KW22KFH00000098765432103333', bank_code: 'KFH'
    },
    {
        id: '00000000-0000-0000-0000-000000000004',
        name: 'Sarah Al-Ghanim', name_arabic: 'سارة الغانم',
        nationality: 'Kuwaiti', department: 'IT', department_arabic: 'تقنية المعلومات',
        position: 'Senior Developer', position_arabic: 'مطور أقدم', role: 'Employee',
        join_date: '2021-05-20', salary: 2200, status: 'Active',
        work_days_per_week: 5, civil_id: '295052004444', civil_id_expiry: '2027-10-10',
        iban: 'KW44GULF00000066778899004444', bank_code: 'GULF'
    },
    {
        id: '00000000-0000-0000-0000-000000000005',
        name: 'John Doe', name_arabic: 'جون دو',
        nationality: 'Expat', department: 'IT', department_arabic: 'تقنية المعلومات',
        position: 'Network Engineer', position_arabic: 'مهندس شبكات', role: 'Employee',
        join_date: '2022-03-15', salary: 1800, status: 'Active',
        work_days_per_week: 6, civil_id: '289031505555', civil_id_expiry: '2026-03-15',
        iban: 'KW51NBK00000011223344555555', bank_code: 'NBK'
    }
];

async function seed() {
    console.log('Seeding Employees...');
    for (const emp of employees) {
        const { error } = await supabase.from('employees').upsert(emp);
        if (error) console.error(`Error seed employee ${emp.name}:`, error.message);
    }

    console.log('Seeding Payroll Runs...');
    const runId = '00000000-0000-0000-0000-000000000123';
    const { error: runError } = await supabase.from('payroll_runs').upsert({
        id: runId,
        period_key: 'FEB-2026',
        cycle_type: 'Monthly',
        status: 'Locked',
        total_disbursement: 18200
    });
    if (runError) console.error('Error seed run:', runError.message);

    console.log('Seeding Payroll Items...');
    const items = employees.map(emp => ({
        run_id: runId,
        employee_id: emp.id,
        employee_name: emp.name,
        basic_salary: emp.salary,
        net_salary: emp.salary,
        verified_by_hr: true
    }));

    for (const item of items) {
        const { error } = await supabase.from('payroll_items').upsert(item);
        if (error) console.error(`Error seed item for ${item.employee_name}:`, error.message);
    }

    console.log('Seeding finished!');
}

seed();
