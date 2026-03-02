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

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function check() {
        const { data, error } = await supabase.from('payroll_items').select('*').limit(1);
        if (data && data.length > 0) {
            process.stdout.write('COLUMNS_LIST:' + Object.keys(data[0]).join(',') + '\n');
        } else {
            process.stdout.write('COLUMNS_LIST:NO_DATA\n');
        }
    }

    check();
} catch (e) {
    console.error(e);
}
