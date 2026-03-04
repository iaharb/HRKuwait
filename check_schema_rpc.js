
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function checkSchema() {
    const { data, error } = await supabase.rpc('run_sql', {
        sql_query: "SELECT column_name, table_name FROM information_schema.columns WHERE table_name IN ('employees', 'variable_compensation')"
    });
    if (error) {
        console.error('Error fetching columns:', error);
    } else {
        const employeesCols = data.filter(c => c.table_name === 'employees').map(c => c.column_name);
        const varCompCols = data.filter(c => c.table_name === 'variable_compensation').map(c => c.column_name);
        console.log('Employees columns:', employeesCols.join(', '));
        console.log('Variable Compensation columns:', varCompCols.join(', '));
    }
}

checkSchema();
