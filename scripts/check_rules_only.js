import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envText = fs.readFileSync('c:/projects/hrportal/.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), (v.join('=') || '').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: rules } = await supabase.from('finance_mapping_rules').select('*, finance_chart_of_accounts(account_code, account_name)');
    let out = '--- RULES ANALYSIS ---\n';
    rules?.forEach(r => {
        if (r.payroll_item_type.includes('leave')) {
            out += `Rule: ${r.rule_name} | Type: ${r.payroll_item_type} | Mode: ${r.credit_or_debit} | Acc: ${r.finance_chart_of_accounts?.account_code}\n`;
        }
    });
    fs.writeFileSync('c:/projects/hrportal/scripts/rule_analysis.txt', out);
}
main().catch(console.error);
