
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const env = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf-8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function check() {
        const { data: items } = await supabase.from('payroll_items').select('*, payroll_runs(period_key)')
            .ilike('employee_name', '%Faisal%');

        console.log('--- FAISAL ITEMS ---');
        items?.forEach(i => console.log(`Run: ${i.payroll_runs.period_key} | Sick: ${i.sick_leave_pay} | Annual: ${i.annual_leave_pay} | ID: ${i.id}`));

        const { data: runs } = await supabase.from('payroll_runs').select('*');
        console.log('--- ALL RUNS ---');
        runs?.forEach(r => console.log(`${r.period_key} | ${r.id}`));
    }

    check();
} catch (e) { console.error(e); }
