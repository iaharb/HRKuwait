
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function check() {
        const { data: runs } = await supabase.from('payroll_runs').select('*').eq('period_key', '2026-01-MONTHLY');
        const runId = runs[0].id;
        const { data: items } = await supabase.from('payroll_items').select('*').eq('run_id', runId).ilike('employee_name', '%Ahmed%');
        console.log('--- AHMED JAN ITEM ---');
        console.log(JSON.stringify(items[0], null, 2));
    }

    check();
} catch (e) { console.error(e); }
