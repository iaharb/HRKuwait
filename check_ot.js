
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://tjkapzlfvxgocfitusxb.supabase.co',
    'sb_publishable_dBSKcdqKKECL9XbyFTEm4Q_RXAvywc1'
);

async function check() {
    const { data, error } = await supabase
        .from('variable_compensation')
        .select('*, employees(name)')
        .eq('comp_type', 'OVERTIME');

    if (error) {
        console.error(error);
        process.exit(1);
    }

    console.log('OT Records count:', data?.length || 0);
    data?.slice(0, 10).forEach(r => {
        console.log(`- ${r.employees?.name}: ${r.amount} hours (${r.status})`);
    });
}

check();
