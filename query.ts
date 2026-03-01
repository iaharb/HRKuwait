import 'dotenv/config';
import { supabase } from './services/supabaseClient.ts';
import { generateJournalEntries } from './services/financeUtils.ts';

async function main() {
    console.log('Querying payroll runs...');
    const { data: runs, error } = await supabase.from('payroll_runs').select('*');
    if (error) console.error(error);

    if (runs) {
        console.log(`Found ${runs.length} runs.`);
        for (const run of runs) {
            console.log(`Run ${run.period_key} status: ${run.status}`);
            if (run.period_key === '2026-1') {
                console.log(`Regenerating JVs for Jan (Run ID: ${run.id})...`);
                try {
                    await generateJournalEntries(run.id);
                    console.log(`Successfully mapped JVs for Jan`);
                } catch (err) {
                    console.error(`Failed mapping Jan:`, err);
                }
            }
        }
    }
}

main();
