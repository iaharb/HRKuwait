
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

    async function check() {
        const { data: runs } = await supabase.from('payroll_runs').select('*').eq('cycle_type', 'Leave_Run');
        console.log('--- LEAVE RUNS ---');
        runs?.forEach(r => console.log(`${r.id}: ${r.status}`));

        if (runs && runs.length > 0) {
            const { data: items } = await supabase.from('payroll_items').select('*').in('run_id', runs.map(r => r.id));
            console.log('--- PAYROLL ITEMS IN LEAVE RUNS ---');
            items?.forEach(i => {
                console.log(`${i.employee_name}: Sick=${i.sick_leave_pay}, Annual=${i.annual_leave_pay}`);
            });
        }
    }

    check();
} catch (e) { console.error(e); }
