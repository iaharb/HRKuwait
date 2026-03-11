
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function check() {
    const { data, error } = await supabase.from('company_settings').select('*');
    if (error) {
        console.log('Error or table missing:', error.message);
    } else {
        console.log('Company Settings exists. Data:', data);
    }
}

check();
