
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const url = `https://tjkappzlfvxgocfitusxhb.supabase.co`;

const supabase = createClient(url, key);

async function check() {
    const { data, error } = await supabase.from('employees').select('count');
    if (error) {
        console.log('Error:', error.message);
    } else {
        console.log('Project tjkappzlfvxgocfitusxhb linked. Employee count:', data);
    }
}

check();
