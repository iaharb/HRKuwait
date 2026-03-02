
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

    async function restore() {
        console.log('--- RESTORING ANNUAL LEAVE TRENDS ---');

        // 1. Jan Reconcile
        const { data: janRuns } = await supabase.from('payroll_runs').select('id').eq('period_key', '2026-01-MONTHLY');
        if (janRuns && janRuns.length > 0) {
            const janId = janRuns[0].id;
            console.log(`Updating Faisal and Layla in Jan (${janId})`);
            await supabase.from('payroll_items').update({ annual_leave_pay: 1250 }).eq('run_id', janId).ilike('employee_name', '%Faisal%');
            await supabase.from('payroll_items').update({ annual_leave_pay: 850 }).eq('run_id', janId).ilike('employee_name', '%Layla%');
        }

        // 2. Feb Reconcile
        const { data: febRuns } = await supabase.from('payroll_runs').select('id').eq('period_key', '2026-02-MONTHLY');
        if (febRuns && febRuns.length > 0) {
            const febId = febRuns[0].id;
            console.log(`Updating Ahmed and Faisal in Feb (${febId})`);
            await supabase.from('payroll_items').update({ sick_leave_pay: 620 }).eq('run_id', febId).ilike('employee_name', '%Ahmed%');
            await supabase.from('payroll_items').update({ annual_leave_pay: 1100 }).eq('run_id', febId).ilike('employee_name', '%Faisal%');
        }

        console.log('Done data update. Refreshing JVs...');
    }

    restore();
} catch (e) { console.error(e); }
