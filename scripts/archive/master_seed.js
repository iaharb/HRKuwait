
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8') + '\n' + (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '');
const urlMatch = env.match(/VITE_SUPABASE_URL="(https:\/\/[^"]+)"/);
const keyMatch = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

if (!urlMatch || !keyMatch) {
    console.error('Missing Supabase Config');
    process.exit(1);
}

const url = urlMatch[1];
const key = keyMatch[1];
const supabase = createClient(url, key);

const gid = () => Math.random().toString(36).substring(2, 11);

async function masterSeed() {
    console.log(`Starting Master Seeding for Staging: ${url}`);

    // 1. Company Settings
    console.log('Seeding company_settings...');
    await supabase.from('company_settings').upsert({
        company_name: 'ENTERPRISE WORKFORCE SOLUTIONS',
        mol_id: '990112',
        employer_id: 'EWS-KH-2024',
        nbk_company_code: 'NBK001',
        kfh_company_code: 'KFH001'
    });

    // 2. Employees (Expanded)
    console.log('Seeding employees...');
    const employees = [
        {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Dr. Faisal Al-Sabah', name_arabic: 'د. فيصل الصباح',
            nationality: 'Kuwaiti', department: 'Executive', position: 'CEO', role: 'Admin',
            join_date: '2015-01-01', salary: 7500, status: 'Active',
            work_days_per_week: 5, civil_id: '280010101111', civil_id_expiry: '2028-12-31',
            iban: 'KW51NBK00000012345678901111', bank_code: 'NBK'
        },
        {
            id: '00000000-0000-0000-0000-000000000002',
            name: 'Layla Al-Fadhli', name_arabic: 'ليلى الفضلي',
            nationality: 'Kuwaiti', department: 'HR', position: 'HR Manager', role: 'HR Manager',
            join_date: '2018-03-12', salary: 3500, status: 'Active',
            work_days_per_week: 5, civil_id: '290031202222', civil_id_expiry: '2027-05-20',
            iban: 'KW89BOUB00000055443322112222', bank_code: 'BOUB'
        },
        {
            id: '00000000-0000-0000-0000-000000000003',
            name: 'Ahmed Al-Mutairi', name_arabic: 'أحمد المطيري',
            nationality: 'Kuwaiti', department: 'IT', position: 'IT Lead', role: 'Manager',
            join_date: '2019-06-15', salary: 3200, status: 'Active',
            work_days_per_week: 5, civil_id: '285052003333', civil_id_expiry: '2026-03-15',
            iban: 'KW22KFH00000098765432103333', bank_code: 'KFH'
        },
        {
            id: '00000000-0000-0000-0000-000000000004',
            name: 'Sarah Al-Ghanim', name_arabic: 'سارة الغانم',
            nationality: 'Kuwaiti', department: 'IT', position: 'Senior Developer', role: 'Employee',
            join_date: '2021-05-20', salary: 2200, status: 'Active',
            work_days_per_week: 5, civil_id: '295052004444', civil_id_expiry: '2027-10-10',
            iban: 'KW44GULF00000066778899004444', bank_code: 'GULF'
        },
        {
            id: '00000000-0000-0000-0000-000000000005',
            name: 'John Doe', name_arabic: 'جون دو',
            nationality: 'Expat', department: 'IT', position: 'Network Engineer', role: 'Employee',
            join_date: '2022-03-15', salary: 1800, status: 'Active',
            work_days_per_week: 6, civil_id: '289031505555', civil_id_expiry: '2026-03-15',
            iban: 'KW51NBK00000011223344555555', bank_code: 'NBK'
        }
    ];

    for (const emp of employees) {
        await supabase.from('employees').upsert(emp);
    }

    // 3. Attendance Logs (3 months)
    console.log('Seeding attendance logs...');
    const attendanceLogs = [];
    const startYear = 2026;
    const targetMonths = [0, 1, 2]; // Jan, Feb, Mar

    for (const month of targetMonths) {
        const daysInMonth = new Date(startYear, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${startYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dateObj = new Date(startYear, month, day);
            if (dateObj.getDay() === 5) continue; // Skip Fridays

            for (const emp of employees) {
                attendanceLogs.push({
                    employee_id: emp.id,
                    employee_name: emp.name,
                    date: dateStr,
                    clock_in: '07:15:00',
                    clock_out: '15:30:00',
                    status: 'On-Site',
                    source: 'Hardware',
                    location: 'HQ Al Hamra'
                });
            }
        }
    }

    // Chunk attendance for Supabase limits
    for (let i = 0; i < attendanceLogs.length; i += 50) {
        await supabase.from('attendance').upsert(attendanceLogs.slice(i, i + 50));
    }

    // 4. Payroll Run
    console.log('Seeding payroll runs...');
    const runId = '00000000-0000-0000-0000-000000000123';
    await supabase.from('payroll_runs').upsert({
        id: runId,
        period_key: 'FEB-2026',
        cycle_type: 'Monthly',
        status: 'Locked',
        total_disbursement: 18200
    });

    const items = employees.map(emp => ({
        run_id: runId,
        employee_id: emp.id,
        employee_name: emp.name,
        basic_salary: emp.salary,
        net_salary: emp.salary,
        verified_by_hr: true
    }));

    for (const item of items) {
        await supabase.from('payroll_items').upsert(item);
    }

    // 5. Finance
    console.log('Seeding finance data...');
    const coas = [
        { account_code: '600100', account_name: 'Basic Salary Expense', account_type: 'EXPENSE', is_active: true },
        { account_code: '600200', account_name: 'Housing Allowance Expense', account_type: 'EXPENSE', is_active: true },
        { account_code: '200100', account_name: 'Net Salary Payable', account_type: 'LIABILITY', is_active: true }
    ];
    for (const coa of coas) {
        await supabase.from('finance_chart_of_accounts').upsert(coa, { onConflict: 'account_code' });
    }

    const ccs = [
        { department_id: 'Management', cost_center_code: 'CC-100', segment_name: 'Exec Management HQ' },
        { department_id: 'HR', cost_center_code: 'CC-200', segment_name: 'Human Resources Operations' },
        { department_id: 'IT', cost_center_code: 'CC-300', segment_name: 'Tech & Engineering' }
    ];
    for (const cc of ccs) {
        await supabase.from('finance_cost_centers').upsert(cc, { onConflict: 'cost_center_code' });
    }

    console.log('Master Seeding Finished!');
}

masterSeed();
