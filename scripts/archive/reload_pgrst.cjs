
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function reloadAndVerify() {
    console.log('Sending reload-schema notification...');
    await supabase.rpc('run_sql', { sql_query: "NOTIFY pgrst, 'reload schema';" });

    console.log('Waiting 5 seconds for cache to update...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('Verifying variable_compensation columns...');
    // Use a query that doesn't rely on specific columns first
    const { data, error } = await supabase.from('variable_compensation').select('*').limit(1);
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Columns found:', Object.keys(data[0] || {}).join(', '));
    }
}

reloadAndVerify();
