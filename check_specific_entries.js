
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
        const runId = '64288c1f-82cb-4261-9c3d-d90ab61f4fb4';
        const { data: entries } = await supabase.from('journal_entries').select('*, finance_chart_of_accounts(account_code, account_name)').eq('payroll_run_id', runId);
        console.log(`--- ENTRIES FOR HUB RUN ${runId} ---`);
        entries?.forEach(e => console.log(`${e.finance_chart_of_accounts.account_code} | ${e.amount} | ${e.entry_type}`));
    }

    check();
} catch (e) { console.error(e); }
