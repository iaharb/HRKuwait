
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env manually if dotenv is tricky
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function checkSchema() {
    const { data, error } = await supabase.rpc('run_sql', {
        sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'employees'"
    });
    if (error) {
        console.error('Error fetching columns:', error);
    } else {
        console.log('Employees columns:', data.map((c) => c.column_name).join(', '));
    }
}

checkSchema();
