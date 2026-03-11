const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: runs } = await supabase.from('payroll_runs').select('id').eq('period_key', '2026-01-MONTHLY').eq('status', 'Draft').single();
    if (!runs) { console.log('No Jan draft run found'); process.exit(0); }
    const { data, error } = await supabase.from('payroll_items').select('*').eq('run_id', runs.id).limit(2);
    if (error) {
        console.error(error);
        process.exit(1);
    }
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
}
main();
