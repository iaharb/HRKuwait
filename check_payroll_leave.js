
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
        const { data: items } = await supabase.from('payroll_items').select('employee_name, sick_leave_pay, annual_leave_pay');
        console.log('--- PAYROLL ITEMS LEAVE PAY ---');
        items?.filter(i => i.sick_leave_pay > 0 || i.annual_leave_pay > 0).forEach(i => {
            console.log(`${i.employee_name}: Sick=${i.sick_leave_pay}, Annual=${i.annual_leave_pay}`);
        });
        if (items?.every(i => i.sick_leave_pay === 0 && i.annual_leave_pay === 0)) {
            console.log('ALL LEAVE PAY AMOUNTS ARE ZERO');
        }
    }

    check();
} catch (e) { console.error(e); }
