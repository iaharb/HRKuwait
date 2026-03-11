
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: runs } = await supabase.from('payroll_runs').select('id, period_key').order('created_at', { ascending: false }).limit(1);
    const runId = runs[0].id;
    console.log(`Checking items for run ${runId} (${runs[0].period_key})`);

    const { data: items } = await supabase.from('payroll_items').select('*').eq('run_id', runId);
    items.forEach(item => {
        console.log(`${item.employee_name}: Net=${item.net_salary}, Basic=${item.basic_salary}, Breakdown=${JSON.stringify(item.allowance_breakdown)}`);
    });
}

check();
