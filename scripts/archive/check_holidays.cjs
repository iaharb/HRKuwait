const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function checkHolidays() {
    const { data, error } = await supabase.from('public_holidays').select('*');
    if (error) console.error(error);
    console.log(JSON.stringify(data, null, 2));
}

checkHolidays();
