
import { createClient } from '@supabase/supabase-client';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function applyConstraint() {
    const { error } = await supabase.rpc('run_sql', { sql_query: 'ALTER TABLE attendance ADD CONSTRAINT attendance_employee_date_key UNIQUE (employee_id, date);' });
    if (error) {
        if (error.message.includes('already exists')) {
            console.log('Constraint already exists');
        } else {
            console.error(error);
        }
    } else {
        console.log('Constraint applied successfully');
    }
}

applyConstraint();
