
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8') + '\n' + (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '');
const urlMatch = env.match(/VITE_SUPABASE_URL="(https:\/\/[^"]+)"/);
const keyMatch = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

if (!urlMatch || !keyMatch) {
    console.error('Missing Supabase Config');
    process.exit(1);
}

const url = urlMatch[1];
const key = keyMatch[1];
const supabase = createClient(url, key);

async function dumpData() {
    const tables = ['employees', 'payroll_runs', 'payroll_items', 'company_settings'];
    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) {
            console.log(`Table ${table}: Error - ${error.message}`);
        } else {
            console.log(`Table ${table}: ${data.length} rows`);
            if (data.length > 0) {
                console.log(JSON.stringify(data.slice(0, 2), null, 2));
            }
        }
    }
}

dumpData();
