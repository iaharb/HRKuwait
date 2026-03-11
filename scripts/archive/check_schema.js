
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://tjkapzlfvxgocfitusxb.supabase.co',
    'sb_publishable_dBSKcdqKKECL9XbyFTEm4Q_RXAvywc1'
);

async function check() {
    const { data, error } = await supabase.rpc('run_sql', {
        sql_query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'variable_compensation';"
    });

    if (error) {
        console.error(error);
        process.exit(1);
    }

    console.log('Columns in variable_compensation:');
    data.forEach(c => {
        console.log(`- ${c.column_name} (${c.data_type})`);
    });
}

check();
