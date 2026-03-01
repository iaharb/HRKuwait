import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://localhost:54321';
const supabaseKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const sql = `
    ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
    ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check 
    CHECK (status IN ('Pending', 'Manager_Approved', 'HR_Approved', 'HR_Finalized', 'Rejected', 'Paid', 'Pushed_To_Payroll'));
  `;
    const { data, error } = await supabase.rpc('run_sql', { sql_query: sql });
    console.log('Result:', data, 'Error:', error);
}

run();
