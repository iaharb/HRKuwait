import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envText = fs.readFileSync('c:/projects/hrportal/.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    if (!k || !v || v.length === 0) return null;
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}).filter(Boolean));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: items } = await supabase.from('payroll_items').select('annual_leave_pay, sick_leave_pay').limit(5);
    console.log('--- PAYROLL ITEMS ---');
    items?.forEach(i => console.log(`Annual: ${i.annual_leave_pay}, Sick: ${i.sick_leave_pay}`));

    const { data: rules } = await supabase.from('finance_mapping_rules').select('rule_name, payroll_item_type, gl_account_id');
    console.log('--- MAPPING RULES ---');
    rules?.forEach(r => console.log(`Rule: ${r.rule_name}, Type: ${r.payroll_item_type}, GL: ${r.gl_account_id}`));

    const { data: accounts } = await supabase.from('finance_chart_of_accounts').select('id, account_code, account_name');
    console.log('--- ACCOUNTS ---');
    accounts?.forEach(a => console.log(`Code: ${a.account_code}, Name: ${a.account_name}, ID: ${a.id}`));

    const { data: entries } = await supabase.from('journal_entries').select('gl_account_id, amount, payroll_item_type').limit(10);
    console.log('--- JOURNAL ENTRIES ---');
    entries?.forEach(e => console.log(`GL: ${e.gl_account_id}, Amt: ${e.amount}, Type: ${e.payroll_item_type}`));
}

main().catch(console.error);
