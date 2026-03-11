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
    // Step 1: Create the run_sql function first
    const createFn = await fetch(`${stageEnv.VITE_SUPABASE_URL}/rest/v1/rpc/run_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ sql_query: 'SELECT 1' })
    });
    console.log('run_sql test:', createFn.status);

    // Try the pg_net approach or direct PostgREST raw query
    // Actually, let's just drop the constraint entirely so it doesn't block anymore
    // We can do this by updating a row with a trigger

    // Alternative: Use the Supabase Management API (requires project ref and service key)
    const projectRef = 'bvpqmejovjqcbxrcvwmf';

    const sqlQuery = `
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

    // Try the SQL endpoint of the Management API
    const mgmtResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ query: sqlQuery })
    });
    console.log('Management API status:', mgmtResponse.status);
    const mgmtText = await mgmtResponse.text();
    console.log('Management API response:', mgmtText);

    process.exit(0);
}
run();
