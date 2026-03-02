
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

    async function refresh() {
        console.log('--- REFRESHING JVs V3 (FOR EOSB) ---');

        const { data: runs } = await supabase.from('payroll_runs').select('*').in('status', ['Finalized', 'Locked', 'JV_Generated', 'finalized', 'locked', 'jv_generated']);
        const { data: mappingRules } = await supabase.from('finance_mapping_rules').select('*');
        const { data: costCenters } = await supabase.from('finance_cost_centers').select('*');
        const { data: employees } = await supabase.from('employees').select('id, name, nationality, department');

        for (const run of (runs || [])) {
            let entryDate = new Date().toISOString();
            const dateMatch = run.period_key.match(/(\d{4})-(\d{1,2})/);
            if (dateMatch) {
                const year = parseInt(dateMatch[1], 10);
                const month = parseInt(dateMatch[2], 10);
                entryDate = new Date(Date.UTC(year, month - 1, 28, 12, 0, 0)).toISOString();
            }

            console.log(`Processing ${run.period_key}...`);
            const { data: items } = await supabase.from('payroll_items').select('*').eq('run_id', run.id);
            if (!items) continue;

            const journalEntries = [];
            items.forEach(item => {
                const emp = employees?.find(e => e.id === item.employee_id);
                if (!emp) return;
                const isLocal = emp.nationality?.toLowerCase() === 'kuwaiti';
                const group = isLocal ? 'LOCAL' : 'EXPAT';
                const cc = costCenters?.find(c => c.department_id === emp.department);
                if (!cc) return;

                const partsDetails = [
                    { type: 'basic_salary', amount: item.basic_salary },
                    { type: 'housing_allowance', amount: item.housing_allowance },
                    { type: 'other_allowances', amount: item.other_allowances },
                    { type: 'sick_leave', amount: item.sick_leave_pay },
                    { type: 'annual_leave', amount: item.annual_leave_pay },
                    { type: 'net_salary_payable', amount: item.net_salary },
                    { type: 'pifss_employer_share', amount: item.pifss_employer_share },
                    { type: 'pifss_deduction', amount: item.pifss_deduction },
                    { type: 'indemnity_accrual', amount: item.indemnity_accrual }, // V3 addition
                ];

                partsDetails.forEach(p => {
                    if (!p.amount || Number(p.amount) <= 0) return;
                    const matched = mappingRules?.filter(r => r.payroll_item_type === p.type && (r.nationality_group === group || r.nationality_group === 'ALL'));
                    matched?.forEach(rule => {
                        journalEntries.push({
                            payroll_run_id: run.id,
                            employee_id: emp.id,
                            cost_center_id: cc.id,
                            gl_account_id: rule.gl_account_id,
                            amount: Number(p.amount),
                            entry_date: entryDate,
                            entry_type: rule.credit_or_debit
                        });
                    });
                });
            });

            if (journalEntries.length >= 0) {
                await supabase.from('journal_entries').delete().eq('payroll_run_id', run.id);
                if (journalEntries.length > 0) {
                    await supabase.from('journal_entries').insert(journalEntries);
                    console.log(`- Inserted ${journalEntries.length} entries.`);
                }
            }
        }
        console.log('Done.');
    }

    refresh();
} catch (e) { console.error(e); }
