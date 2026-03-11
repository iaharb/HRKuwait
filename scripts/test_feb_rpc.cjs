const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function testFeb() {
    console.log('Testing RPC for FEB 2026...');
    try {
        const { data, error } = await supabase.rpc('generate_payroll_draft', {
            p_period_key: '2026-02-MONTHLY',
            p_cycle_type: 'Monthly'
        });
        if (error) console.error('SQL EXEC ERROR:', error.message);
        else console.log('FEB SUCCESS:', data);
    } catch (e) {
        console.error('FETCH ERROR caught in script:', e.message);
    }
    process.exit(0);
}
testFeb();
