
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

    async function checkFaisal() {
        const { data: emps } = await supabase.from('employees').select('id, name').ilike('name', '%Faisal%');
        const fid = emps[0].id;
        const { data: bals } = await supabase.from('leave_balances').select('*').eq('employee_id', fid);
        const { data: reqs } = await supabase.from('leave_requests').select('*').eq('employee_id', fid);

        console.log(`--- FAISAL STATS ---`);
        reqs.filter(r => ['Manager_Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid'].includes(r.status))
            .forEach(r => console.log(`REQ: ${r.type} | ${r.days}d`));

        bals.filter(b => b.used_days > 0).forEach(b => console.log(`BAL: ${b.leave_type} | ${b.used_days}`));
    }

    checkFaisal();
} catch (e) { console.error(e); }
