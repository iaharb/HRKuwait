
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

async function checkAppUsers() {
    const { data, error } = await supabase.from('app_users').select('*');
    if (error) {
        console.log(`Table app_users: Error - ${error.message}`);
    } else {
        console.log(`Table app_users: ${data.length} rows`);
        if (data.length > 0) {
            console.log(JSON.stringify(data, null, 2));
        }
    }
}

checkAppUsers();
