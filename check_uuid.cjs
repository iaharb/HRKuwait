const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function addAdminUser() {
    const { data: eData } = await supabase.from('employees').select('id').limit(1).single();
    const validUUID = eData?.id || '00000000-0000-0000-0000-000000000000';

    console.log('UUID to use:', validUUID);
}

addAdminUser();
