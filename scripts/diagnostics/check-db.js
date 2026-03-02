import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    if (!urlMatch || !keyMatch) {
        throw new Error('Credentials not found');
    }

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function check() {
        const { data: accounts, error } = await supabase.from('finance_chart_of_accounts').select('*').in('account_code', ['600500', '600600', '600100', '600200', '600300', '600400']);
        console.log('Accounts:', JSON.stringify(accounts, null, 2));

        const { data: rules } = await supabase.from('finance_mapping_rules').select('*');
        console.log('Rules count:', rules?.length);
        console.log('Mapping to 600500/600600:', rules?.filter(r => accounts?.some(a => a.id === r.gl_account_id && (a.account_code === '600500' || a.account_code === '600600'))));
    }

    check();
} catch (e) {
    console.error(e);
}
