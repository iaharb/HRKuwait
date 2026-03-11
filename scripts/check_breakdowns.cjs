
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log("Checking for NULL breakdowns...");
    const { data, error } = await supabase.from('payroll_items').select('id, employee_name, allowance_breakdown, deduction_breakdown');
    if (error) return console.error(error);

    const nullBreakdowns = data.filter(item => 
        item.allowance_breakdown === null || 
        item.deduction_breakdown === null
    );

    if (nullBreakdowns.length > 0) {
        console.log(`Found ${nullBreakdowns.length} items with NULL breakdowns.`);
        console.log("Samples:", nullBreakdowns.slice(0, 2));
    } else {
        console.log("No NULL breakdowns found.");
    }
}

check();
