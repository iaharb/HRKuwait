
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8') + '\n' + fs.readFileSync('.env', 'utf8');
const key = env.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/)[1];
const url = `https://bvpqmejovjqcbxrcvvmf.supabase.co`; // Changed w to vv to match the key

const supabase = createClient(url, key);

async function check() {
    const { data, error } = await supabase.from('employees').select('count');
    if (error) {
        console.log('Error:', error.message);
    } else {
        console.log('Project bvpqmejovjqcbxrcvvmf linked. Employee count:', data);
    }
}

check();
