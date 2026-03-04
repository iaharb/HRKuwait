
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://tjkapzlfvxgocfitusxb.supabase.co',
    'sb_publishable_dBSKcdqKKECL9XbyFTEm4Q_RXAvywc1'
);

async function check() {
    const { data, error } = await supabase.rpc('run_sql', {
        sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
    });

    if (error) {
        console.error(error);
        process.exit(1);
    }

    console.log('Tables in public schema:');
    data.forEach(t => {
        console.log(`- ${t.table_name}`);
    });
}

check();
