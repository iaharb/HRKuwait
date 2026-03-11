const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function testRpc() {
    console.log('Testing generate_payroll_draft for 2026-01-MONTHLY...');
    const start = Date.now();
    try {
        const { data, error } = await supabase.rpc('generate_payroll_draft', {
            p_period_key: '2026-01-MONTHLY',
            p_cycle_type: 'Monthly'
        });

        if (error) {
            console.error('RPC Error:', error.message);
        } else {
            console.log('RPC Success in', (Date.now() - start) / 1000, 'seconds');
            console.log('Result:', data);
        }
    } catch (e) {
        console.error('Script Error:', e.message);
    }
    process.exit(0);
}

testRpc();
