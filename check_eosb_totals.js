
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
        const { data: entries } = await supabase.from('journal_entries').select('*, finance_chart_of_accounts!inner(account_code)');
        const prov = entries?.filter(e => e.finance_chart_of_accounts.account_code === '200300');
        const exp = entries?.filter(e => e.finance_chart_of_accounts.account_code === '600800');

        const totalProv = prov?.reduce((s, e) => s + Number(e.amount), 0);
        const totalExp = exp?.reduce((s, e) => s + Number(e.amount), 0);

        console.log('Total Provision (200300):', totalProv);
        console.log('Total Expense (600800):', totalExp);
    }

    check();
} catch (e) { console.error(e); }
