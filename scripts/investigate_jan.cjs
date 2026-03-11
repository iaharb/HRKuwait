const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: runs, error } = await supabase.from('payroll_runs').select('*').eq('period_key', '2026-01-MONTHLY');
    if (error) {
        console.error(error);
        process.exit(1);
    }
    console.log('Runs for Jan:', JSON.stringify(runs, null, 2));

    for (const run of runs) {
        const { count, error: vcError } = await supabase.from('variable_compensation').select('id', { count: 'exact', head: true }).eq('payroll_run_id', run.id);
        console.log(`Run ${run.id} (${run.status}) has ${count} VC items linked.`);
    }
    process.exit(0);
}
main();
