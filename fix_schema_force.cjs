
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function fixSchema() {
    const sql = `
    -- Ensure variable_compensation has correct columns
    ALTER TABLE variable_compensation ADD COLUMN IF NOT EXISTS comp_type VARCHAR(50);
    ALTER TABLE variable_compensation ADD COLUMN IF NOT EXISTS sub_type VARCHAR(100);
    ALTER TABLE variable_compensation ADD COLUMN IF NOT EXISTS amount NUMERIC(10,3);
    ALTER TABLE variable_compensation ADD COLUMN IF NOT EXISTS status VARCHAR(50);
    ALTER TABLE variable_compensation ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE variable_compensation ADD COLUMN IF NOT EXISTS metadata JSONB;
    
    NOTIFY pgrst, 'reload schema';
  `;

    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('Fix failed:', error);
    } else {
        console.log('Schema fix applied and reload triggered.');
    }
}

fixSchema();
