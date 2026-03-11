
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function checkColumns() {
    const { data, error } = await supabase
        .from('employees')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching employees:', error);
    } else if (data && data.length > 0) {
        console.log('Columns found in employees table:', Object.keys(data[0]).join(', '));
    } else {
        console.log('No data in employees table to check columns.');
    }
}

checkColumns();
