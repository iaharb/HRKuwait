const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://tjkapzlfvxgocfitusxb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U');

async function main() {
    const { data: runs, error } = await supabase
        .from('payroll_runs')
        .select('*')
        .ilike('period_key', '%SARAH%');
    
    if (error) {
        console.error(error);
        return;
    }

    for (const run of runs) {
        console.log(`Run ID: ${run.id}, Period: ${run.period_key}, Start: ${run.locked_start}, End: ${run.locked_end}`);
        if (run.locked_start !== '2026-01-01' && run.period_key.includes('2026-01')) {
            console.log(`LOG: Fixing Locked Start for Jan run...`);
            const { error: patchError } = await supabase
                .from('payroll_runs')
                .update({ locked_start: '2026-01-01' })
                .eq('id', run.id);
            if (patchError) console.error(patchError);
            else console.log(`LOG: FIX SUCCESS`);
        }
    }
}
main();
