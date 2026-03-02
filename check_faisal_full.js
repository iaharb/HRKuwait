
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

        const employeeId = "00000000-0000-0000-0000-000000000001";
        const { data, error } = await supabase
            .from('payroll_items')
            .select('*, payroll_runs(*)')
            .eq('employee_id', employeeId);

        if (error) {
            console.error("Error:", error);
            return;
        }

        console.log("Full data for Faisal:", JSON.stringify(data, null, 2));

    } catch (e) {
        console.error(e);
    }
}

check();
