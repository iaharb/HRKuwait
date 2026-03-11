
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function checkFunc() {
    console.log("Fetching generate_payroll_draft source...");
    const { data, error } = await supabase.rpc('run_sql', { sql: "SELECT prosrc FROM pg_proc WHERE proname = 'generate_payroll_draft';" });
    if (error) {
        // Fallback: maybe run_sql doesn't exist
        console.log("run_sql failed, trying another way...");
        const { data: data2, error: error2 } = await supabase.from('payroll_runs').select('id').limit(1);
        console.log("Connection test:", data2 ? "OK" : error2);
        return;
    }
    console.log("Function source:", data);
}

checkFunc();
