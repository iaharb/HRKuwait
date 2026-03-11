
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8') + '\n' + (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '');
const urlMatch = env.match(/VITE_SUPABASE_URL="?(https:\/\/[^"\s]+)"?/);
const serviceRoleMatch = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="?([^"\s]+)"?/);

if (!urlMatch || !serviceRoleMatch) {
    console.error('Missing Supabase Config');
    process.exit(1);
}

const supabase = createClient(urlMatch[1], serviceRoleMatch[1]);

async function checkAllRuns() {
    const { data: runs, error } = await supabase.from('payroll_runs').select('*');
    if (error) { console.error(error); return; }
    console.log(`TOTAL_RUNS_COUNT:${runs.length}`);
    runs.forEach(r => console.log(`RUN|${r.id}|${r.period_key}|${r.created_at}`));
}

checkAllRuns();
