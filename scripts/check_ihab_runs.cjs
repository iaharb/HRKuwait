
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: items } = await supabase.from('payroll_items').select('employee_name, run_id, allowance_breakdown').ilike('employee_name', '%Ihab%');
    for (const item of items) {
        const { data: run } = await supabase.from('payroll_runs').select('period_key').eq('id', item.run_id).single();
                console.log(`Employee: ${item.employee_name}, Period: ${run?.period_key}, Breakdown: ${JSON.stringify(item.allowance_breakdown)}`);
    }
}

check();
