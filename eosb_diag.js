
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
        // 1. Check Accounts
        const { data: accounts } = await supabase.from('finance_chart_of_accounts').select('account_code, account_name').in('account_code', ['200300', '600800']);
        console.log('--- EOSB ACCOUNTS ---');
        accounts?.forEach(a => console.log(`${a.account_code}: ${a.account_name}`));

        // 2. Check Mapping Rules
        const { data: rules } = await supabase.from('finance_mapping_rules').select('payroll_item_type, gl_account_id');
        console.log('--- RULES FOR EOSB/INDEMNITY ---');
        rules?.filter(r => r.payroll_item_type.includes('indemnity')).forEach(r => {
            const acc = accounts?.find(a => a.id === r.gl_account_id);
            console.log(`${r.payroll_item_type} -> ${acc ? acc.account_code : r.gl_account_id}`);
        });

        // 3. Check Payroll Items Columns
        const { data: cols } = await supabase.rpc('run_sql', { sql: "SELECT column_name FROM information_schema.columns WHERE table_name = 'payroll_items'" });
        console.log('--- PAYROLL ITEMS COLUMNS ---');
        console.log(cols ? cols.map(c => c.column_name).join(', ') : 'No data');

        // 4. Check IF entries exist already
        const { data: entries } = await supabase.from('journal_entries').select('*, finance_chart_of_accounts!inner(account_code)').in('finance_chart_of_accounts.account_code', ['200300', '600800']);
        console.log(`--- ENTRIES FOR 200300/600800: ${entries?.length || 0} ---`);
    }

    check();
} catch (e) { console.error(e); }
