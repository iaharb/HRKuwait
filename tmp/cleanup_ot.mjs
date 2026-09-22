
import { createClient } from '@supabase/supabase-client';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupSmallOT() {
    console.log('Starting cleanup of overtime records <= 1 hour...');
    const { data, error } = await supabase.rpc('run_sql', { 
        sql_query: "DELETE FROM variable_compensation WHERE comp_type = 'OVERTIME' AND status = 'PENDING_MANAGER' AND amount <= 1;" 
    });
    
    if (error) {
        console.error('Error during cleanup:', error);
    } else {
        console.log('Cleanup successful. Records with amount <= 1 hour have been removed.');
    }
}

cleanupSmallOT();
