
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function checkFull() {
        const { data: emps } = await supabase.from('employees').select('id, name');
        const { data: bals } = await supabase.from('leave_balances').select('*').gt('used_days', 0);

        console.log('--- NON-ZERO BALANCES (ALL TYPES DEDUCT FROM ANNUAL EXCEPT SICK/HAJJ) ---');
        bals.sort((a, b) => a.employee_id.localeCompare(b.employee_id));
        bals.forEach(b => {
            const emp = emps.find(e => e.id === b.employee_id);
            console.log(`${emp?.name || b.employee_id.substring(0, 8)} | ${b.leave_type.padEnd(15)} | ${b.used_days}`);
        });

        const { data: reqs } = await supabase.from('leave_requests').select('employee_name, type, days, status');
        console.log('--- APPROVED/FINALIZED REQUESTS ---');
        reqs?.filter(r => ['Manager_Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid'].includes(r.status))
            .forEach(r => console.log(`${r.employee_name.padEnd(20)} | ${r.type.padEnd(10)} | ${r.days}d | ${r.status}`));
    }

    checkFull();
} catch (e) { console.error(e); }
