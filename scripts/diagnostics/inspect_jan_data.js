
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.*)"/) ?
    env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1] :
    env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function checkAmounts() {
    const { data: entries } = await supabase
        .from('journal_entries')
        .select(`amount, finance_chart_of_accounts!inner(account_code)`)
        .ilike('payroll_run_id', 'a9999b72-0310-427e-b637-cc5d64111%')
        .in('finance_chart_of_accounts.account_code', ['600500', '600600']);

    console.log("Jan Wellness Entry Amounts:", entries.map(e => e.amount));
}

checkAmounts();
