
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
        const { data, error } = await supabase.from('finance_chart_of_accounts').select('*').in('account_code', ['600500', '600600', '600100', '600700', '600800', '200300']);
        if (error) {
            console.log('Error:', error.message);
        } else {
            console.log('--- ACCOUNTS ---');
            console.log(JSON.stringify(data, null, 2));
        }

        const { data: rules } = await supabase.from('finance_mapping_rules').select('*');
        console.log('--- MAPPING RULES ---');
        console.log(JSON.stringify(rules, null, 2));
    }

    check();
} catch (e) { console.error(e); }
