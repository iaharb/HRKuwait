
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function check() {
    try {
        const envPath = path.join(__dirname, '.env');
        const env = fs.readFileSync(envPath, 'utf-8');
        const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
        const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

        const supabaseUrl = urlMatch[1].trim();
        const supabaseAnonKey = keyMatch[1].trim();

        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const { data: faisal } = await supabase.from('employees').select('id, name').ilike('name', '%Faisal%');
        console.log("Faisal Employees:", JSON.stringify(faisal));

        if (faisal && faisal.length > 0) {
            for (const f of faisal) {
                const { data: items } = await supabase.from('payroll_items').select('id, run_id').eq('employee_id', f.id);
                console.log(`Payroll Items for ${f.name} (${f.id}):`, JSON.stringify(items));
            }
        }
    } catch (e) {
        console.error(e);
    }
}

check();
