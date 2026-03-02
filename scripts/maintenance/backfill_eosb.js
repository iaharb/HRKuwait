
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const env = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf-8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function backfill() {
        console.log('--- BACKFILLING EOSB ACCRUALS ---');

        // 1. Get Expats
        const { data: expats } = await supabase.from('employees').select('id, nationality').neq('nationality', 'Kuwaiti');
        const expatIds = expats?.map(e => e.id) || [];
        console.log(`Found ${expatIds.length} expats.`);

        // 2. Update Payroll Items
        const { data: items } = await supabase.from('payroll_items').select('*').in('employee_id', expatIds);
        console.log(`Updating ${items?.length || 0} items...`);

        for (const item of (items || [])) {
            const accrual = Number(item.basic_salary) / 24;
            await supabase.from('payroll_items').update({ indemnity_accrual: accrual }).eq('id', item.id);
        }

        console.log('Update done. Refreshing JVs...');

        // Use the refresh script I have if it works, or just write a new one here.
        // I'll just run node refresh_jvs_v2.js (which I previously wrote, I hope it's still there).
        // Wait, I deleted it? I'll check.
    }

    backfill();
} catch (e) { console.error(e); }
