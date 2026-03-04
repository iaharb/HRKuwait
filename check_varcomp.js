
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function checkVarComp() {
    const { data, error } = await supabase
        .from('variable_compensation')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching variable_compensation:', error);
    } else if (data && data.length > 0) {
        console.log('Columns found in variable_compensation table:', Object.keys(data[0]).join(', '));
    } else {
        console.log('No data in variable_compensation table.');
    }
}

checkVarComp();
