
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
        const { data: accounts } = await supabase.from('finance_chart_of_accounts').select('account_code, account_name');
        console.log('--- GL ACCOUNTS ---');
        accounts?.forEach(a => console.log(`${a.account_code}: ${a.account_name}`));

        const { data: rules } = await supabase.from('finance_mapping_rules').select('payroll_item_type, gl_account_id');
        console.log('--- MAPPING RULES ---');
        rules?.forEach(r => {
            const acc = accounts?.find(a => a.id === r.gl_account_id);
            console.log(`${r.payroll_item_type} -> ${acc ? acc.account_code : r.gl_account_id}`);
        });

        const { data: entries } = await supabase.from('journal_entries').select('id', { count: 'exact' });
        console.log(`Total Journal Entries: ${entries?.length || 0}`);
    }

    check();
} catch (e) { console.error(e); }
