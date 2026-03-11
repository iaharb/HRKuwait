import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function getTables() {
    const { data, error } = await supabaseAdmin.rpc('run_sql', {
        sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    });
    if (error) {
        console.error('Error fetching tables:', error);
        return;
    }
    console.log('Tables in Production:');
    console.log(data.map(t => t.table_name).sort());
}

getTables();
