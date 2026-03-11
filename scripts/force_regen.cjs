const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    // Step 1: Hard rollback all periods
    for (const period of ['2026-01', '2026-02']) {
        console.log(`Rolling back ${period}...`);
        const { data, error } = await supabase.rpc('rollback_payroll_run_rpc', { p_period_key: period });
        if (error) { console.error(period, error); } else { console.log(period, data); }
    }

    // Step 2: Regenerate both fresh
    for (const [period, cycle] of [['2026-01-MONTHLY', 'Monthly'], ['2026-02-MONTHLY', 'Monthly']]) {
        console.log(`Generating ${period}...`);
        const { data, error } = await supabase.rpc('generate_payroll_draft', { p_period_key: period, p_cycle_type: cycle });
        if (error) { console.error(period, error.message); } else { console.log(period, 'Run ID:', data); }
    }
    process.exit(0);
}
main();
