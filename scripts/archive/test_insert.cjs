
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function testInsert() {
    const { error } = await supabase.from('variable_compensation').insert([
        { employee_id: '00000000-0000-0000-0000-000000000001', comp_type: 'OVERTIME', amount: 1 }
    ]);
    if (error) {
        console.error('Insert failed:', error);
    } else {
        console.log('Insert succeeded.');
    }
}

testInsert();
