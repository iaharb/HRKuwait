
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8') + '\n' + (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '');
const urlMatch = env.match(/VITE_SUPABASE_URL="(https:\/\/[^"]+)"/);
const anonKeyMatch = env.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);

if (!urlMatch || !anonKeyMatch) {
    console.error('Missing Supabase Config');
    process.exit(1);
}

const url = urlMatch[1];
const key = anonKeyMatch[1];
const supabase = createClient(url, key);

async function testAnon() {
    console.log(`Testing ANON access to: ${url}`);
    const { data, error } = await supabase.from('employees').select('id');
    if (error) {
        console.error('ANON access failed:', error);
    } else {
        console.log(`ANON access successful: Found ${data.length} employees.`);
    }
}

testAnon();
