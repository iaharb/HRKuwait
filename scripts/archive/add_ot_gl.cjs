const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function addOvertimeGL() {
    const sql = `
    -- Insert new Chart of Accounts entry for Overtime
    INSERT INTO finance_chart_of_accounts (account_code, account_name, account_type, is_active)
    VALUES ('600900', 'Overtime Expense', 'EXPENSE', true)
    ON CONFLICT (account_code) DO NOTHING;

    -- Insert new Mapping Rule
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, credit_or_debit, gl_account_id)
    SELECT 'Overtime - All', 'overtime', 'ALL', 'DR', id
    FROM finance_chart_of_accounts
    WHERE account_code = '600900'
    ON CONFLICT DO NOTHING;
  `;

    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('Adding Overtime GL Failed:', error);
    } else {
        console.log('Overtime GL mapping and account added successfully.');
    }
}

addOvertimeGL();
