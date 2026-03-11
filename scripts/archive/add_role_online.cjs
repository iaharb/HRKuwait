
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function addRoleColumn() {
    const sql = `
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Employee';
    
    -- Update roles for core accounts
    UPDATE employees SET role = 'Admin' WHERE name = 'Dr. Faisal Al-Sabah';
    UPDATE employees SET role = 'HR Manager' WHERE name = 'Layla Al-Fadhli';
    UPDATE employees SET role = 'Manager' WHERE name = 'Ahmed Al-Mutairi';
    
    NOTIFY pgrst, 'reload schema';
  `;

    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('Role column added and updated successfully.');
    }
}

addRoleColumn();
