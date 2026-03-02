
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
        const { data } = await supabase.from('journal_entries').select('*, finance_chart_of_accounts(account_code)');
        const counts = {};
        data?.forEach(d => {
            const code = d.finance_chart_of_accounts?.account_code || 'NULL';
            counts[code] = (counts[code] || 0) + 1;
        });
        console.log('--- ENTRY COUNTS BY CODE ---');
        console.log(counts);
    }

    check();
} catch (e) { console.error(e); }
