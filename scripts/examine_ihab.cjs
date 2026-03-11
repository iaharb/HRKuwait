
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: items } = await supabase.from('payroll_items').select('*').ilike('employee_name', '%Ihab%').limit(1);
    if (!items || items.length === 0) return console.log("Ihab not found");
    
    const item = items[0];
    console.log("Full Item for Ihab:");
    console.log(JSON.stringify(item, null, 2));
}

check();
