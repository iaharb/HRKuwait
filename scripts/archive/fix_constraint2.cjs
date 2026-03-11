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

// Use the REST API to execute SQL directly via the Supabase Management API
const supabaseUrl = stageEnv.VITE_SUPABASE_URL;
const serviceKey = stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY;

async function run() {
    // Method 1: Try the REST endpoint for SQL
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

    // Use the /rest/v1/rpc endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/run_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ sql_query: sql })
    });

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response:', text);

    process.exit(0);
}
run();
