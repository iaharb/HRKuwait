
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log("Checking payroll_items for NULL balances...");
    const { data, error } = await supabase.from('payroll_items').select('*');
    if (error) return console.error(error);

    const problemItems = data.filter(item => 
        item.basic_salary === null || 
        item.net_salary === null || 
        item.housing_allowance === null ||
        item.other_allowances === null
    );

    if (problemItems.length > 0) {
        console.log("Found items with NULL values:", problemItems);
    } else {
        console.log("No NULL values found in basic/net/allowances.");
    }

    // Check for 0 net salary
    const zeroNet = data.filter(item => item.net_salary === 0);
    if (zeroNet.length > 0) {
        console.log("Items with 0 net salary:", zeroNet.map(i => ({name: i.employee_name, run_id: i.run_id})));
    }
}

check();
