
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
        const p = accounts?.find(a => a.account_code === '200300');
        const e = accounts?.find(a => a.account_code === '600800');
        console.log('Account 200300:', p ? 'FOUND' : 'MISSING');
        console.log('Account 600800:', e ? 'FOUND' : 'MISSING');

        const { data: rules } = await supabase.from('finance_mapping_rules').select('*');
        const ir = rules?.find(r => r.payroll_item_type === 'indemnity_accrual');
        console.log('Indemnity Accrual Rule:', ir ? 'FOUND' : 'MISSING');

        const { data: items } = await supabase.from('payroll_items').select('*').limit(1);
        if (items && items[0]) {
            console.log('Columns in payroll_items:', Object.keys(items[0]).join(', '));
        }
    }

    check();
} catch (e) { console.error(e); }
