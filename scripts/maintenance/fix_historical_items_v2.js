
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

    async function fixItems() {
        console.log('Fixing Hub items...');

        // Step 1: Get Leave Runs
        const { data: runs } = await supabase.from('payroll_runs').select('id, target_leave_id').eq('cycle_type', 'Leave_Run');
        if (!runs) return;

        for (const run of runs) {
            // Step 2: Get Items for this run
            const { data: items } = await supabase.from('payroll_items')
                .select('*')
                .eq('run_id', run.id)
                .eq('sick_leave_pay', 0)
                .eq('annual_leave_pay', 0);

            if (!items || items.length === 0) continue;

            // Step 3: Get Leave Type
            const { data: lreq } = await supabase.from('leave_requests').select('type').eq('id', run.target_leave_id).single();
            const isSick = lreq?.type === 'Sick';
            const isHajj = lreq?.type === 'Hajj';

            for (const item of items) {
                if (item.basic_salary > 0) {
                    console.log(`- Updating ${item.employee_name} in ${run.id}: basic -> ${isSick ? 'sick' : 'annual'}`);
                    await supabase.from('payroll_items').update({
                        basic_salary: 0,
                        sick_leave_pay: isSick ? item.basic_salary : 0,
                        annual_leave_pay: (!isSick && !isHajj) ? item.basic_salary : 0
                    }).eq('id', item.id);
                }
            }
        }

        console.log('Done.');
    }

    fixItems();
} catch (e) { console.error(e); }
