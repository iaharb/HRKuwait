const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function checkLeave() {
    const { data, error } = await supabase.from('leave_requests').select('*').eq('id', 'dfad28c8-00db-4767-ae30-c5dc7fccede2').single();
    if (error) console.error(error);
    console.log(JSON.stringify(data, null, 2));
}

checkLeave();
