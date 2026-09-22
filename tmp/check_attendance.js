
import { createClient } from '@supabase/supabase-client';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFuture() {
    const { data, error } = await supabase.from('attendance').select('date').gt('date', '2026-03-16').order('date', {ascending: false}).limit(10);
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data));
}

checkFuture();
