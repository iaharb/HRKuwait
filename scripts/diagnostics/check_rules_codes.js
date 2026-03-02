
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
        const { data: rules } = await supabase.from('finance_mapping_rules').select('payroll_item_type, gl_account_id, finance_chart_of_accounts(account_code)');
        console.log('--- RULES ---');
        rules?.forEach(r => {
            console.log(`${r.payroll_item_type} -> ${r.finance_chart_of_accounts ? r.finance_chart_of_accounts.account_code : 'NULL'}`);
        });

        const { data: entries } = await supabase.from('journal_entries').select('*, finance_chart_of_accounts(account_code)');
        const codes = new Set();
        entries?.forEach(e => codes.add(e.finance_chart_of_accounts?.account_code));
        console.log('Unique Codes in Journal Entries:', Array.from(codes));
    }

    check();
} catch (e) { console.error(e); }
