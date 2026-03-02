// import 'dotenv/config';
import { supabase } from '../../src/services/supabaseClient.ts';

async function checkData() {
    console.log('--- Strategy Dashboard Data Audit ---');

    // 1. Check finalized runs
    const { data: runs } = await supabase
        .from('payroll_runs')
        .select('id, period_key, status')
        .in('status', ['Finalized', 'Locked', 'finalized', 'locked']);

    console.log(`Finalized Runs found: ${runs?.length || 0}`);

    if (runs && runs.length > 0) {
        const runIds = runs.map(r => r.id);

        // 2. Check journal entries for these runs
        const { data: entries } = await supabase
            .from('journal_entries')
            .select('payroll_run_id, count')
            .in('payroll_run_id', runIds);

        const entryCounts: Record<string, number> = {};
        entries?.forEach((e: any) => {
            entryCounts[e.payroll_run_id] = (entryCounts[e.payroll_run_id] || 0) + 1;
        });

        runs.forEach(run => {
            const count = entryCounts[run.id] || 0;
            console.log(`Period ${run.period_key}: ${count} GL entries found. ${count > 0 ? '✅ Ready' : '⚠️ Missing JVs'}`);
        });
    } else {
        console.log('No finalized payroll runs found in the system.');
    }
}

checkData();
