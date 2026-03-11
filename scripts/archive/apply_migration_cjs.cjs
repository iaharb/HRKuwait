
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function applyMigration() {
    const sql = `
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id);
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_name TEXT;

    UPDATE employees SET manager_id = '00000000-0000-0000-0000-000000000001', manager_name = 'Dr. Faisal Al-Sabah' 
    WHERE id IN ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');

    UPDATE employees SET manager_id = '00000000-0000-0000-0000-000000000003', manager_name = 'Ahmed Al-Mutairi' 
    WHERE id IN ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005');

    NOTIFY pgrst, 'reload schema';
  `;

    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('Migration applied successfully.');
    }
}

applyMigration();
