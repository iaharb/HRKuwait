import { supabase } from './services/supabaseClient.ts';

async function listAllRuns() {
    const { data: runs } = await supabase.from('payroll_runs').select('period_key, status');
    console.log('--- All Payroll Runs ---');
    if (runs) {
        runs.forEach(r => console.log(`${r.period_key}: ${r.status}`));
    } else {
        console.log('No runs found.');
    }
}

listAllRuns();
