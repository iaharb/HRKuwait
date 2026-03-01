import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    let env;
    if (fs.existsSync(path.join(__dirname, '..', '.env.local'))) {
        env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
    } else {
        env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
    }
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    if (!urlMatch || !keyMatch) {
        throw new Error('Credentials not found');
    }

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function check() {
        const { data: accounts } = await supabase.from('finance_chart_of_accounts').select('*');
        const { data: rules } = await supabase.from('finance_mapping_rules').select('*');

        fs.writeFileSync('db_dump.json', JSON.stringify({ accounts, rules }, null, 2));
    }

    check();
} catch (e) {
    console.error(e);
}
