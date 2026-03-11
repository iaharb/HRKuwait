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
    // 1. Delete payroll items for both runs
    const runIds = [
        '64288c1f-82cb-4261-9c3d-d90ab61f4fb4',  // LR-DR.-2026-02-22 (Faisal leave run)
        'ee05bb00-0000-4000-a000-111122223333'      // MIGRATION-EOSB-INITIAL-SYNC
    ];

    for (const runId of runIds) {
        // Delete journal entries
        const { data: je, error: jeErr } = await client.from('journal_entries').delete().eq('payroll_run_id', runId).select();
        console.log(`Journal entries deleted for ${runId}: ${je ? je.length : 0}`, jeErr || '');

        // Delete payroll items
        const { data: items, error: itemErr } = await client.from('payroll_items').delete().eq('run_id', runId).select();
        console.log(`Payroll items deleted for ${runId}: ${items ? items.length : 0}`, itemErr || '');

        // Delete the run itself
        const { data: run, error: runErr } = await client.from('payroll_runs').delete().eq('id', runId).select();
        console.log(`Payroll run deleted ${runId}: ${run ? run.length : 0}`, runErr || '');
    }

    // 2. Verify
    const { data: remainingRuns } = await client.from('payroll_runs').select('*');
    const { data: remainingItems } = await client.from('payroll_items').select('*');
    console.log(`\nRemaining payroll runs: ${remainingRuns ? remainingRuns.length : 0}`);
    console.log(`Remaining payroll items: ${remainingItems ? remainingItems.length : 0}`);

    console.log('\nDone - payroll engine should now be unlocked.');
    process.exit(0);
}
run();
