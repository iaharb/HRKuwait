
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const env = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf-8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function reload() {
        console.log("Reloading schema cache...");
        const { error } = await supabase.rpc('run_sql', { sql_query: "NOTIFY pgrst, 'reload schema';" });
        if (error) {
            console.log('Error reloading schema:', error.message);
        } else {
            console.log('Reload signal sent.');
        }
    }

    reload();
} catch (e) { console.error(e); }
