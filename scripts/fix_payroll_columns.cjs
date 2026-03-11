const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('Synchronizing payroll_items schema...');

    // Explicitly adding columns one by one to ensure safety
    const columns = [
        { name: 'overtime_pay', type: 'NUMERIC DEFAULT 0' },
        { name: 'bonus_pay', type: 'NUMERIC DEFAULT 0' },
        { name: 'lateness_deductions', type: 'NUMERIC DEFAULT 0' },
        { name: 'unpaid_days', type: 'NUMERIC DEFAULT 0' }
    ];

    for (const col of columns) {
        console.log(`Adding column: ${col.name}...`);
        const { error } = await supabase.rpc('run_sql', {
            sql_query: `ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`
        });
        if (error) {
            console.error(`Error adding ${col.name}:`, error.message);
        } else {
            console.log(`Column ${col.name} verified.`);
        }
    }

    // Refresh API cache
    await supabase.rpc('run_sql', { sql_query: "NOTIFY pgrst, 'reload schema';" });
    console.log('Schema alignment complete.');
    process.exit(0);
}

main();
