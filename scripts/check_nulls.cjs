
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log("Checking for NULL salaries or problematic data...");
    const { data: employees, error } = await supabase.from('employees').select('id, name, salary, status');
    if (error) return console.error(error);

    const nullSalaries = employees.filter(e => e.salary === null);
    if (nullSalaries.length > 0) {
        console.log("Employees with NULL salary:", nullSalaries);
    } else {
        console.log("No NULL salaries found.");
    }

    const activeEmps = employees.filter(e => e.status === 'Active');
    console.log(`Active employees count: ${activeEmps.length}`);

    // Check Variable Compensation for NULL amounts
    const { data: vc, error: vcError } = await supabase.from('variable_compensation').select('*').is('amount', null);
    if (vcError) console.error(vcError);
    else if (vc.length > 0) console.log("VC with NULL amounts:", vc);
}

check();
