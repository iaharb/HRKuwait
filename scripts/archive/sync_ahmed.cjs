const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const stageEnvRaw = fs.readFileSync('.env.local', 'utf-8') + '\n' + fs.readFileSync('.env', 'utf-8');
const stageEnv = Object.fromEntries(
    stageEnvRaw.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
            const index = line.indexOf('=');
            return [line.slice(0, index), line.slice(index + 1).replace(/"/g, '')];
        })
);

const stageClient = createClient(stageEnv.VITE_SUPABASE_URL, stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: emp } = await stageClient.from('employees').select('name, department, manager_id').eq('name', 'Ahmed Al-Mutairi');
    fs.writeFileSync('emp_ahmed.json', JSON.stringify(emp, null, 2));
    console.log("Written emp_ahmed.json");
    process.exit(0);
}
run();
