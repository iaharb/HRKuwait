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

const supabaseUrl = stageEnv.VITE_SUPABASE_URL;
const serviceKey = stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY;

async function run() {
    // Step 1: Create the run_sql function using the PostgREST's schema definition endpoint
    // We need to use the pg_net extension or a migration-style approach

    // Actually, the simplest way for online Supabase is to use the SQL Editor API
    // which is at /pg/ endpoint

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

    // Try the /pg endpoint (Supabase's PostgREST SQL editor)  
    const pgResponse = await fetch(`${supabaseUrl}/pg/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ query: sqlQuery })
    });
    console.log('/pg/query status:', pgResponse.status);

    // Try the meta endpoint
    const metaResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
        }
    });
    console.log('Schema endpoint:', metaResponse.status);

    // Last resort: try creating the function via PostgREST by inserting into pg_proc or using a SQL function
    // Actually let me try creating a function first then calling it

    // Step 1: Create a temp function
    const createFnSql = `
        CREATE OR REPLACE FUNCTION fix_leave_constraint()
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        BEGIN
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
        END;
        $$;
    `;

    // We can't create a function via PostgREST directly... 
    // Let's check if there's a migration endpoint

    // Actually, we need to approach this from the Supabase Dashboard
    console.log('\n=== MANUAL FIX REQUIRED ===');
    console.log('Please run this SQL in the Supabase SQL Editor:');
    console.log(sqlQuery);

    process.exit(0);
}
run();
