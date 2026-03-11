
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function testRpc() {
    console.log("Calling generate_payroll_draft RPC...");
    const periodKey = '2026-03-MONTHLY';
    const { data, error } = await supabase.rpc('generate_payroll_draft', {
        p_period_key: periodKey,
        p_cycle_type: 'Monthly'
    });

    if (error) return console.error("RPC Error:", error);
    console.log("RPC Success:", data);

    const { data: items, error: itemsError } = await supabase.from('payroll_items').select('*').eq('run_id', data.id);
    if (itemsError) return console.error("Items Error:", itemsError);

    console.log(`Generated ${items.length} items.`);
    items.forEach(item => {
        console.log(`Employee: ${item.employee_name}, Net: ${item.net_salary}, Breakdown: ${JSON.stringify(item.allowance_breakdown)}`);
    });
}

testRpc();
