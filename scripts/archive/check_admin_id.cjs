const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function getAdminId() {
    const { data } = await supabase.from('users').select('id, name, role').eq('role', 'Admin').limit(1).single();
    const { data: eData } = await supabase.from('employees').select('id, name, role').limit(1).single();

    console.log('Admin ID from users:', data?.id);
    console.log('Admin ID from employees:', eData?.id);
}

getAdminId();
