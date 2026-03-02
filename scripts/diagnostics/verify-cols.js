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
        const { data: cols, error } = await supabase.rpc('run_sql_query', { sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'payroll_items'" });
        // Wait, the rpc name might be 'run_sql'? No, 'run_sql' usually returns void.
        // Let's use it as a return void if I can't find a query one.

        // Alternative: just try to insert a row with those columns and see if it fails.
        const { data, error: iError } = await supabase.from('payroll_items').select('sick_leave_pay').limit(1);
        if (iError) {
            console.error('Error selecting column:', iError);
        } else {
            console.log('Column exists!');
        }
    }

    check();
} catch (e) {
    console.error(e);
}
