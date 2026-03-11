
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function test() {
    console.log("Generating draft for 2026-04-MONTHLY...");
    const { data: run, error: runError } = await supabase.rpc('generate_payroll_draft', {
        p_period_key: '2026-04-MONTHLY',
        p_cycle_type: 'Monthly'
    });

    if (runError) return console.error("RPC Error:", runError);
    console.log("Run generated:", run);

    const { data: items } = await supabase.from('payroll_items').select('*').eq('run_id', run.id);
    console.log(`Generated ${items.length} items.`);
    items.forEach(item => {
        console.log(`${item.employee_name}: Net=${item.net_salary}, Basic=${item.basic_salary}, Breakdown=${JSON.stringify(item.allowance_breakdown)}`);
    });
}

test();
