
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
        const { data: entries } = await supabase.from('journal_entries').select('entry_date, amount, finance_chart_of_accounts(account_code, account_name)');
        const eosb = entries?.filter(e => ['600800', '200300'].includes(e.finance_chart_of_accounts.account_code));

        console.log('--- EOSB JOURNAL ENTRIES ---');
        eosb?.forEach(e => {
            console.log(`${e.entry_date.substring(0, 7)} | ${e.finance_chart_of_accounts.account_code} | ${e.amount} | ${e.finance_chart_of_accounts.account_name}`);
        });
    }

    check();
} catch (e) { console.error(e); }
