
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

async function checkDuplicates() {
    const { data: runs, error: runError } = await supabase
        .from('payroll_runs')
        .select('id, period_key, created_at, status')
        .ilike('period_key', '%FEB-2026%');

    if (runError) { console.error(runError); return; }

    console.log(`Runs found: ${runs.length}`);
    for (const r of runs) {
        console.log(`RUN ID: ${r.id}, Key: ${r.period_key}`);
        const { data: items, error: itemError } = await supabase
            .from('payroll_items')
            .select('id, employee_id, employee_name')
            .eq('run_id', r.id);

        if (itemError) { console.error(itemError); continue; }

        const counts = {};
        items.forEach(i => {
            counts[i.employee_id] = (counts[i.employee_id] || 0) + 1;
        });

        const multi = Object.entries(counts).filter(([eid, count]) => count > 1);
        console.log(`  Items in run: ${items.length}`);
        console.log(`  Duplicate employees in run: ${multi.length}`);
        if (multi.length > 0) {
            multi.slice(0, 5).forEach(([eid, count]) => {
                const names = items.filter(i => i.employee_id === eid).map(i => i.employee_name);
                console.log(`  - Emp ID: ${eid}, Name: ${names[0]}, Count: ${count}`);
            });
        }
    }
}

checkDuplicates();
