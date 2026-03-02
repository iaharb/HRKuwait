
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
        const { data: entries } = await supabase.from('journal_entries').select('*, finance_chart_of_accounts(account_code, account_name)');
        console.log('--- JOURNAL ENTRIES ---');
        entries?.forEach(e => {
            if (['600500', '600600'].includes(e.finance_chart_of_accounts.account_code)) {
                console.log(`Date: ${e.entry_date} | Code: ${e.finance_chart_of_accounts.account_code} | Amt: ${e.amount} | RunID: ${e.payroll_run_id}`);
            }
        });

        const { data: runs } = await supabase.from('payroll_runs').select('*');
        console.log('--- PAYROLL RUNS ---');
        runs?.forEach(r => console.log(`ID: ${r.id} | PK: ${r.period_key} | Status: ${r.status} | Created: ${r.created_at}`));
    }

    check();
} catch (e) { console.error(e); }
