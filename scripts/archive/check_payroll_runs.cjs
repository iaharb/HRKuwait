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
    // Get all payroll runs
    const { data: runs, error } = await client.from('payroll_runs').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); process.exit(1); }

    console.log(`Total payroll runs: ${runs.length}`);
    for (const r of runs) {
        console.log(`  ID: ${r.id} | Period: ${r.period_key} | Type: ${r.cycle_type} | Status: ${r.status} | Target Leave: ${r.target_leave_id || 'N/A'}`);
    }

    // Get all payroll items
    const { data: items } = await client.from('payroll_items').select('id, run_id, employee_name, basic_salary, net_salary');
    console.log(`\nTotal payroll items: ${items ? items.length : 0}`);
    for (const i of (items || [])) {
        console.log(`  RunID: ${i.run_id} | Employee: ${i.employee_name} | Net: ${i.net_salary}`);
    }

    // Get journal entries
    const { data: je } = await client.from('journal_entries').select('id, payroll_run_id, account_name, debit, credit');
    console.log(`\nTotal journal entries: ${je ? je.length : 0}`);

    process.exit(0);
}
run();
