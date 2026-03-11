const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envRaw = fs.readFileSync('.env.local', 'utf-8') + '\n' + fs.readFileSync('.env', 'utf-8');
const env = Object.fromEntries(envRaw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/\"/g, '')]));
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY);
client.from('leave_requests').select('id, employee_name, department, manager_id, status').then(res => {
    fs.writeFileSync('leaves_summary.json', JSON.stringify(res.data, null, 2));
    console.log("Written leaves_summary.json");
    process.exit(0);
});
