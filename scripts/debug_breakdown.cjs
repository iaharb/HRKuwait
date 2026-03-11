
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function debugBreakdown() {
    console.log("Debugging breakdown calculation...");
    
    // We can't easily run the nested subqueries, but we can check the inputs.
    const { data: employees } = await supabase.from('employees').select('id, name, salary').limit(5);
    
    // Check if employee_allowances table has data
    const { data: allws } = await supabase.from('employee_allowances').select('*');
    console.log(`Employee Allowances count: ${allws.length}`);

    // Check Variable Comp
    const { data: vc } = await supabase.from('variable_compensation').select('*').eq('status', 'APPROVED_FOR_PAYROLL');
    console.log(`Approved VC count: ${vc.length}`);

    // If these are zero, and we only have basic pay...
    // Let's check why basic pay might be missing from breakdown.
}

debugBreakdown();
