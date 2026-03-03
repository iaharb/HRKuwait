
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkTables() {
    try {
        const envPath = path.join(__dirname, '.env');
        const env = fs.readFileSync(envPath, 'utf-8');
        const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
        const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

        const supabaseUrl = urlMatch[1].trim();
        const supabaseAnonKey = keyMatch[1].trim();
        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const { data, error } = await supabase.from('claims').select('*').limit(1);
        if (error) {
            console.log("Claims table error (likely doesn't exist):", error.message);
        } else {
            console.log("Claims table exists. Sample:", data);
        }
    } catch (e) {
        console.error(e);
    }
}

checkTables();
