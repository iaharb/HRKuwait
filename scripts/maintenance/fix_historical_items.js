
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
        // Find all payroll items in Leave_Runs where sick/annual pay is 0 but basic is > 0
        const { data: items } = await supabase.from('payroll_items')
            .select('*, payroll_runs!inner(cycle_type, target_leave_id)')
            .eq('payroll_runs.cycle_type', 'Leave_Run')
            .eq('sick_leave_pay', 0)
            .eq('annual_leave_pay', 0)
            .gt('basic_salary', 0);

        console.log(`Found ${items?.length || 0} items to fix.`);

        for (const item of (items || [])) {
            const { data: lreq } = await supabase.from('leave_requests').select('type').eq('id', (item as any).payroll_runs.target_leave_id).single();
            const isSick = lreq?.type === 'Sick';
            const isHajj = lreq?.type === 'Hajj';

            console.log(`- Updating ${item.employee_name} (${lreq?.type}): basic -> ${isSick ? 'sick' : 'annual'}`);
            await supabase.from('payroll_items').update({
                basic_salary: 0,
                sick_leave_pay: isSick ? item.basic_salary : 0,
                annual_leave_pay: (!isSick && !isHajj) ? item.basic_salary : 0
            }).eq('id', item.id);
        }

        console.log('Done.');
    }

    fixItems();
} catch (e) { console.error(e); }
