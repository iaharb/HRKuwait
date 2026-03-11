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
    // Get the check constraint definition
    const { data, error } = await client.rpc('get_check_constraints', {});
    if (error) {
        // Fallback: query pg_catalog directly
        const { data: d2, error: e2 } = await client.from('pg_constraint').select('*');
        console.log('Fallback:', d2, e2);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }

    // Try raw SQL approach
    const { data: d3, error: e3 } = await client.rpc('exec_sql', { sql: "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'leave_requests_status_check'" });
    console.log('SQL result:', d3, e3);

    process.exit(0);
}
run();
