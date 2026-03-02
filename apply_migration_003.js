
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

    async function applyRecalc() {
        console.log("Reading migration 003...");
        const sql = fs.readFileSync(path.join(__dirname, 'migrations', '003_recalculate_leave_balances.sql'), 'utf-8');

        // This file has DO blocks and FUNCTION definitions which use semicolons internally ($$).
        // Splitting by semicolon alone will break them.
        // We can try to send it in chunks:
        // 1. Function definition
        // 2. Trigger drop/create
        // 3. DO block

        const chunks = [
            // Function
            sql.substring(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('$$ LANGUAGE plpgsql;') + 20),
            // Trigger
            sql.substring(sql.indexOf('DROP TRIGGER'), sql.indexOf('EXECUTE FUNCTION update_leave_balances();') + 41),
            // DO Block
            sql.substring(sql.indexOf('DO $$'), sql.lastIndexOf('$$;') + 3)
        ];

        for (let i = 0; i < chunks.length; i++) {
            console.log(`Executing chunk ${i + 1}...`);
            const { error } = await supabase.rpc('run_sql', { sql_query: chunks[i] });
            if (error) {
                console.error(`Error in chunk ${i + 1}:`, error.message);
            }
        }
        console.log("Migration 003 applied.");
    }

    applyRecalc();
} catch (e) { console.error(e); }
