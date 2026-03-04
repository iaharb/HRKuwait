
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function addOvertimeToPayroll() {
    const sql = `
    ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS overtime_amount NUMERIC DEFAULT 0;
    NOTIFY pgrst, 'reload schema';
  `;

    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('overtime_amount column added successfully.');
    }
}

addOvertimeToPayroll();
