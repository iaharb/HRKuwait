import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tjkapzlfvxgocfitusxb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjU0MjIsImV4cCI6MjA4NTcwMTQyMn0.sZVL7JE8aG8geFzC2z-_xRjMkozSQoIb1Tvohmk53c0';

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
