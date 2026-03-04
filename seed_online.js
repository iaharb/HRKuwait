
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

const employees = [
    {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Dr. Faisal Al-Sabah',
        nationality: 'Kuwaiti',
        department: 'Executive',
        position: 'CEO',
        join_date: '2015-01-01',
        salary: 7500,
        status: 'Active',
        work_days_per_week: 5,
        role: 'Admin',
        manager_id: null
    },
    {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Layla Al-Fadhli',
        nationality: 'Kuwaiti',
        department: 'HR',
        position: 'HR Manager',
        join_date: '2018-03-12',
        salary: 3500,
        status: 'Active',
        work_days_per_week: 5,
        role: 'HR Manager',
        manager_id: '00000000-0000-0000-0000-000000000001'
    },
    {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'Ahmed Al-Mutairi',
        nationality: 'Kuwaiti',
        department: 'IT',
        position: 'IT Lead',
        join_date: '2019-06-15',
        salary: 3200,
        status: 'Active',
        work_days_per_week: 5,
        role: 'Manager',
        manager_id: '00000000-0000-0000-0000-000000000001'
    },
    {
        id: '00000000-0000-0000-0000-000000000004',
        name: 'Sarah Al-Ghanim',
        nationality: 'Kuwaiti',
        department: 'IT',
        position: 'Senior Developer',
        join_date: '2021-05-20',
        salary: 2200,
        status: 'Active',
        work_days_per_week: 5,
        role: 'Employee',
        manager_id: '00000000-0000-0000-0000-000000000003'
    },
    {
        id: '00000000-0000-0000-0000-000000000005',
        name: 'John Doe',
        nationality: 'Expat',
        department: 'IT',
        position: 'Network Engineer',
        join_date: '2022-03-15',
        salary: 1800,
        status: 'Active',
        work_days_per_week: 6,
        role: 'Employee',
        manager_id: '00000000-0000-0000-0000-000000000003'
    }
];

async function seedOnline() {
    console.log('Seeding online database...');

    // 1. Seed Employees
    for (const emp of employees) {
        const { error } = await supabase.from('employees').upsert(emp);
        if (error) console.error(`Error upserting ${emp.name}:`, error);
    }
    console.log('Employees seeded.');

    // 2. Generate Attendance Logs
    const attendanceLogs = [];
    const startYear = 2026;
    const targetMonths = [0, 1, 2]; // Jan, Feb, Mar

    for (const month of targetMonths) {
        const daysInMonth = new Date(startYear, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${startYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayOfWeek = new Date(startYear, month, day).getDay();

            if (dayOfWeek === 5) continue;

            for (const emp of employees) {
                let hourIn = 7;
                let minIn = 0;

                if (Math.random() > 0.8) {
                    // Late
                    minIn = Math.floor(Math.random() * 59);
                    if (minIn < 31) minIn = 35; // Ensure it's late
                } else {
                    // On time
                    minIn = Math.floor(Math.random() * 15);
                }

                let hourOut = 15;
                let minOut = 30;

                // Simulating Overtime for Ahmed and Sarah (IT team)
                if ((emp.name === 'Ahmed Al-Mutairi' || emp.name === 'Sarah Al-Ghanim') && Math.random() > 0.7) {
                    hourOut = 20;
                    minOut = 0;
                }

                attendanceLogs.push({
                    employee_id: emp.id,
                    employee_name: emp.name,
                    date: dateStr,
                    clock_in: `${String(hourIn).padStart(2, '0')}:${String(minIn).padStart(2, '0')}:00`,
                    clock_out: `${String(hourOut).padStart(2, '0')}:${String(minOut).padStart(2, '0')}:15`,
                    status: minIn > 30 ? 'Late' : 'On-Site',
                    source: 'Hardware',
                    location: 'HQ Tower'
                });
            }
        }
    }

    const { error: attError } = await supabase.from('attendance').upsert(attendanceLogs);
    if (attError) console.error('Error seeding attendance:', attError);
    else console.log(`Seeded ${attendanceLogs.length} attendance records.`);

    console.log('Online seeding finished.');
}

seedOnline();
