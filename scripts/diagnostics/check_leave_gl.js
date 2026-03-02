
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
        const { data: accounts } = await supabase.from('finance_chart_of_accounts').select('*');
        const sickAcc = accounts?.find(a => a.account_code === '600500');
        const annualAcc = accounts?.find(a => a.account_code === '600600');

        console.log('Sick Leave Account (600500):', sickAcc ? 'FOUND' : 'MISSING');
        console.log('Annual Leave Account (600600):', annualAcc ? 'FOUND' : 'MISSING');

        const { data: rules } = await supabase.from('finance_mapping_rules').select('*');
        const sickRule = rules?.find(r => r.payroll_item_type === 'sick_leave');
        const annualRule = rules?.find(r => r.payroll_item_type === 'annual_leave');

        console.log('Sick Leave Mapping Rule:', sickRule ? 'FOUND' : 'MISSING');
        console.log('Annual Leave Mapping Rule:', annualRule ? 'FOUND' : 'MISSING');

        if (sickRule) {
            const acc = accounts?.find(a => a.id === sickRule.gl_account_id);
            console.log(`Sick Leave Rule maps to: ${acc ? acc.account_code : sickRule.gl_account_id}`);
        }
        if (annualRule) {
            const acc = accounts?.find(a => a.id === annualRule.gl_account_id);
            console.log(`Annual Leave Rule maps to: ${acc ? acc.account_code : annualRule.gl_account_id}`);
        }
    }

    check();
} catch (e) { console.error(e); }
