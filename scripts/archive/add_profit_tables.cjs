const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function addProfitSharingTables() {
    const sql = `
    -- 1. Profit Bonus Pools
    CREATE TABLE IF NOT EXISTS profit_bonus_pools (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       period_name TEXT NOT NULL,
       total_net_profit NUMERIC NOT NULL,
       recommended_pool_pct NUMERIC NOT NULL,
       approved_pool_amount NUMERIC NOT NULL,
       distribution_method TEXT NOT NULL,
       eligibility_cutoff_date DATE NOT NULL,
       total_distributed NUMERIC DEFAULT 0,
       status TEXT DEFAULT 'DRAFT', 
       created_by UUID REFERENCES employees(id),
       approved_by UUID REFERENCES employees(id),
       created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
    );

    -- 2. Employee Bonus Allocations
    CREATE TABLE IF NOT EXISTS employee_bonus_allocations (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       pool_id UUID REFERENCES profit_bonus_pools(id),
       employee_id UUID REFERENCES employees(id),
       allocated_amount NUMERIC NOT NULL,
       is_paid BOOLEAN DEFAULT FALSE,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
    );

    -- 3. Accrued Bonuses Liability & Expense GL Accounts
    INSERT INTO finance_chart_of_accounts (account_code, account_name, account_type, is_active)
    VALUES ('510400', 'Employee Benefits Expense', 'EXPENSE', true)
    ON CONFLICT (account_code) DO NOTHING;

    INSERT INTO finance_chart_of_accounts (account_code, account_name, account_type, is_active)
    VALUES ('210500', 'Accrued Bonuses Payable', 'LIABILITY', true)
    ON CONFLICT (account_code) DO NOTHING;

    -- Mapping Rule (Though manual journal entries will be used for accruals, 
    -- we might still need a mapping for final payout 'company_bonus' if handled by payroll)
    INSERT INTO finance_mapping_rules (rule_name, payroll_item_type, nationality_group, credit_or_debit, gl_account_id)
    SELECT 'Company Bonus / Profit Post', 'company_bonus', 'ALL', 'DR', id
    FROM finance_chart_of_accounts
    WHERE account_code = '510400'
    ON CONFLICT DO NOTHING;

    NOTIFY pgrst, 'reload schema';
  `;

    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('Profit Sharing tables added successfully.');
    }
}

addProfitSharingTables();
