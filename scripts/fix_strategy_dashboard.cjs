const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('Synchronizing Strategy Dashboard accounts...');

    // 1. Check/Add accounts
    const accounts = [
        { account_code: '600500', account_name: 'Sick Leave Expense', account_type: 'EXPENSE', is_active: true },
        { account_code: '600600', account_name: 'Annual Leave Expense', account_type: 'EXPENSE', is_active: true }
    ];

    for (const acc of accounts) {
        const { data: existing } = await supabase.from('finance_chart_of_accounts').select('id').eq('account_code', acc.account_code).maybeSingle();
        if (!existing) {
            console.log(`Adding account: ${acc.account_code} - ${acc.account_name}`);
            await supabase.from('finance_chart_of_accounts').insert(acc);
        } else {
            console.log(`Account ${acc.account_code} verified.`);
        }
    }

    // 2. Fetch account IDs for mapping
    const { data: accountList } = await supabase.from('finance_chart_of_accounts').select('id, account_code');
    const accountMap = Object.fromEntries(accountList.map(a => [a.account_code, a.id]));

    // 3. Check/Add mapping rules
    const rules = [
        { rule_name: 'Sick Leave Accrual', payroll_item_type: 'sick_leave', nationality_group: 'ALL', gl_account_id: accountMap['600500'], credit_or_debit: 'DR' },
        { rule_name: 'Annual Leave Accrual', payroll_item_type: 'annual_leave', nationality_group: 'ALL', gl_account_id: accountMap['600600'], credit_or_debit: 'DR' }
    ];

    for (const rule of rules) {
        if (!rule.gl_account_id) continue;
        const { data: existing } = await supabase.from('finance_mapping_rules').select('id').eq('payroll_item_type', rule.payroll_item_type).maybeSingle();
        if (!existing) {
            console.log(`Adding mapping rule for: ${rule.payroll_item_type}`);
            await supabase.from('finance_mapping_rules').insert(rule);
        } else {
            console.log(`Rule for ${rule.payroll_item_type} verified.`);
        }
    }

    // 4. Force a re-run of JVs if possible? No, user should do it.

    console.log('Strategy Dashboard synchronization complete.');
    process.exit(0);
}

main();
