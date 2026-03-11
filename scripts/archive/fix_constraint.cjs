const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const stageEnvRaw = fs.readFileSync('.env.local', 'utf-8') + '\n' + fs.readFileSync('.env', 'utf-8');
const stageEnv = Object.fromEntries(
    stageEnvRaw.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
            const index = line.indexOf('=');
            return [line.slice(0, index), line.slice(index + 1).replace(/"/g, '')];
        })
);

const client = createClient(stageEnv.VITE_SUPABASE_URL, stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // Drop and recreate the constraint with all valid statuses
    const sql = `
        ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
        ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check 
        CHECK (status IN (
            'Pending', 
            'Pending_Manager', 
            'Manager_Approved', 
            'HR_Approved', 
            'HR_Finalized', 
            'Resumed', 
            'Rejected', 
            'Paid', 
            'Pushed_To_Payroll'
        ));
    `;

    const { data, error } = await client.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('Error updating constraint:', error);
    } else {
        console.log('Constraint updated successfully!');
    }

    process.exit(0);
}
run();
