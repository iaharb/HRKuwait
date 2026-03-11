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

const stageClient = createClient(stageEnv.VITE_SUPABASE_URL, stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // 1. Delete all rows from leave_history containing Paid or Pushed_To_Payroll
    await stageClient.from('leave_history')
        .delete()
        .or('action.ilike.%Paid%,action.ilike.%Pushed_To_Payroll%');

    // 2. Clear history jsonb if it contains it
    const { data: leaves } = await stageClient.from('leave_requests').select('*');
    for (let l of (leaves || [])) {
        let history = l.history || [];
        let newHistory = history.filter(h => {
            const acts = h.action || '';
            return !acts.includes('Paid') && !acts.includes('Pushed_To_Payroll');
        });
        if (newHistory.length !== history.length) {
            await stageClient.from('leave_requests').update({ history: newHistory }).eq('id', l.id);
        }
    }
    console.log("Cleanup done.");
    process.exit(0);
}
run();
