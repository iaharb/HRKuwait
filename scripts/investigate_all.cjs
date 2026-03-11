const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: runs, error } = await supabase.from('payroll_runs').select('*');
    if (error) { console.error(error); process.exit(1); }
    console.log('Total Runs:', runs.length);
    console.log(JSON.stringify(runs, null, 2));

    const { data: vc, error: vcErr } = await supabase.from('variable_compensation').select('id, payroll_run_id').not('payroll_run_id', 'is', null);
    console.log('VC with run IDs:', JSON.stringify(vc, null, 2));
    process.exit(0);
}
main();
