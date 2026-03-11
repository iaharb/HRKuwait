
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

async function finalCheck() {
    const { data: items, error } = await supabase.from('payroll_items').select('id, employee_name, run_id');
    if (error) { console.error(error); return; }
    console.log(`Final Item Count: ${items.length}`);
    items.forEach(i => console.log(`- ItemID: ${i.id}, Employee: ${i.employee_name}, RunID: ${i.run_id}`));
}

finalCheck();
