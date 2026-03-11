const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    try {
        const migrationsDir = 'supabase/migrations';
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        console.log(`Found ${files.length} migrations to apply.`);

        for (const file of files) {
            console.log(`Applying ${file}...`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            try {
                const { data, error } = await supabase.rpc('run_sql', { sql_query: sql });
                if (error) {
                    console.error(`Error applying ${file}:`, error);
                } else if (data && data.success === false) {
                    console.error(`SQL Error in ${file}:`, data.message);
                } else {
                    console.log(`Success: ${file}`);
                }
            } catch (inner) {
                console.error(`Exception applying ${file}:`, inner.message);
            }
        }
    } catch (err) {
        console.error("Main error:", err);
    }
}
main();
