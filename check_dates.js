
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
        const { data: reqs } = await supabase.from('leave_requests').select('employee_name, type, start_date, end_date, status');
        console.log('--- LEAVE REQUESTS ---');
        reqs?.forEach(r => console.log(`${r.employee_name}: ${r.type} (${r.start_date} to ${r.end_date}) -> ${r.status}`));

        const { data: runs } = await supabase.from('payroll_runs').select('period_key, status');
        console.log('--- PAYROLL RUNS ---');
        runs?.forEach(r => console.log(`${r.period_key}: ${r.status}`));
    }

    check();
} catch (e) { console.error(e); }
