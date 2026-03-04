
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
);

async function check() {
    const { data, error } = await supabase
        .from('variable_compensation')
        .select('*, employees(name)')
        .eq('comp_type', 'OVERTIME');

    if (error) {
        console.error(error);
        return;
    }

    console.log('OT Records count:', data.length);
    data.slice(0, 5).forEach(r => {
        console.log(`- ${r.employees?.name}: ${r.amount} hours (${r.status})`);
    });
}

check();
