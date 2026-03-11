const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: runs } = await supabase.from('payroll_runs').select('id, period_key').like('period_key', '2026-02%');
    if (runs && runs.length > 0) {
        const { data: items } = await supabase.from('payroll_items').select('*').eq('run_id', runs[0].id).limit(1);
        console.log(items[0].allowance_breakdown);
        console.log(items[0].deduction_breakdown);
    }
    process.exit(0);
}
main();
