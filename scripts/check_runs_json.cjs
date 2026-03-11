
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase.from('payroll_runs').select('*').order('created_at', { ascending: false }).limit(5);
    if (error) {
        fs.writeFileSync('scripts/runs_result.json', JSON.stringify({error: error.message}));
        return;
    }
    fs.writeFileSync('scripts/runs_result.json', JSON.stringify(data, null, 2));
}

check();
