
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

async function checkRLS() {
    const { data, error } = await supabase.rpc('run_sql', {
        sql_query: "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'"
    });
    if (error) {
        console.error('Error checking RLS:', error);
        // Fallback: try to select from a table without service role if possible? No.
        return;
    }
    console.log('RLS Status:');
    console.log(JSON.stringify(data, null, 2));

    const { data: policies, error: polError } = await supabase.rpc('run_sql', {
        sql_query: "SELECT * FROM pg_policies WHERE schemaname = 'public'"
    });
    if (!polError) {
        console.log('Policies:');
        console.log(JSON.stringify(policies, null, 2));
    }
}

checkRLS();
