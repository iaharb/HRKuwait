const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    try {
        console.log('Synchronizing Strategy Dashboard accounts...');

        // 1. Manage Accounts
        const accountsToEnforce = [
            { account_code: '600500', account_name: 'Sick Leave Expense', account_type: 'EXPENSE' },
            { account_code: '600600', account_name: 'Annual Leave Expense', account_type: 'EXPENSE' }
        ];

        for (const acc of accountsToEnforce) {
            const { data: existing } = await supabase.from('finance_chart_of_accounts').select('id').eq('account_code', acc.account_code).maybeSingle();
            if (!existing) {
                console.log(`+ Adding account ${acc.account_code}`);
                await supabase.from('finance_chart_of_accounts').insert({ ...acc, is_active: true });
            } else {
                console.log(`- Account ${acc.account_code} confirmed.`);
            }
        }

        // Fresh fetch for IDs
        const { data: accounts } = await supabase.from('finance_chart_of_accounts').select('id, account_code');
        const acMap = {};
        accounts.forEach(a => { acMap[a.account_code] = a.id; });

        // 2. Manage Rules
        const rulesToEnforce = [
            { rule_name: 'Sick Leave Rule', payroll_item_type: 'sick_leave', nationality_group: 'ALL', gl_id: acMap['600500'] },
            { rule_name: 'Annual Leave Rule', payroll_item_type: 'annual_leave', nationality_group: 'ALL', gl_id: acMap['600600'] }
        ];

        for (const rule of rulesToEnforce) {
            if (!rule.gl_id) {
                console.warn(`WARNING: Account for ${rule.rule_name} not found.`);
                continue;
            }
            const { data: existing } = await supabase.from('finance_mapping_rules').select('id').eq('payroll_item_type', rule.payroll_item_type).maybeSingle();
            if (!existing) {
                console.log(`+ Adding rule for ${rule.payroll_item_type}`);
                await supabase.from('finance_mapping_rules').insert({
                    rule_name: rule.rule_name,
                    payroll_item_type: rule.payroll_item_type,
                    nationality_group: rule.nationality_group,
                    gl_account_id: rule.gl_id,
                    credit_or_debit: 'DR'
                });
            } else {
                console.log(`- Rule for ${rule.payroll_item_type} already exists.`);
            }
        }

        console.log('Strategy Dashboard sync successful.');
        process.exit(0);

    } catch (err) {
        console.error('CRITICAL SYNC ERROR:', err.message);
        process.exit(1);
    }
}

main();
