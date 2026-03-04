
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function checkCols() {
    const { data, error } = await supabase.from('employees').select('*').limit(1);
    if (data && data.length > 0) {
        console.log(Object.keys(data[0]).join(', '));
    } else {
        // If no rows, check info schema
        const { data: cols } = await supabase.rpc('run_sql', { sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'employees'" });
        console.log(cols);
    }
}
checkCols();
