import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    let env;
    if (fs.existsSync(path.join(__dirname, '..', '.env.local'))) {
        env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
    } else {
        env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
    }
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function addCols() {
        const sql = `
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS sick_leave_pay NUMERIC DEFAULT 0;
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS annual_leave_pay NUMERIC DEFAULT 0;
    `;
        // Try using RPC if run_sql exists
        const { data, error } = await supabase.rpc('run_sql', { sql_query: sql });
        if (error) {
            console.error('Error adding columns:', error);
        } else {
            console.log('Columns added successfully');
        }
    }

    addCols();
} catch (e) {
    console.error(e);
}
