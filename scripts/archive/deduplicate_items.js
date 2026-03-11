
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

async function deduplicateItems() {
    const runId = '00000000-0000-0000-0000-000000000123';
    console.log(`Deduplicating items for run: ${runId}`);

    const { data: items, error: itemError } = await supabase
        .from('payroll_items')
        .select('id, employee_id')
        .eq('run_id', runId);

    if (itemError) { console.error('Fetch error:', itemError); return; }
    console.log(`Found ${items.length} total items.`);

    const keep = {};
    const toDelete = [];

    items.forEach(item => {
        if (!keep[item.employee_id]) {
            keep[item.employee_id] = item.id;
        } else {
            toDelete.push(item.id);
        }
    });

    console.log(`Keeping ${Object.keys(keep).length} items. Deleting ${toDelete.length} duplicates.`);

    if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
            .from('payroll_items')
            .delete()
            .in('id', toDelete);

        if (deleteError) {
            console.error('Delete error:', deleteError);
        } else {
            console.log('Duplicates deleted successfully.');
        }
    }
}

deduplicateItems();
