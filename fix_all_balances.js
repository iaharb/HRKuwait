
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

    async function fixBalances() {
        const { data: emps } = await supabase.from('employees').select('id');
        const types = ['Annual', 'Sick', 'Emergency', 'ShortPermission', 'Hajj'];
        const year = 2026;

        const upserts = [];
        for (const emp of emps) {
            for (const type of types) {
                upserts.push({
                    employee_id: emp.id,
                    leave_type: type,
                    entitled_days: type === 'Annual' ? 30 : type === 'Sick' ? 15 : type === 'Emergency' ? 6 : type === 'ShortPermission' ? 2 : 1,
                    used_days: 0,
                    year: year
                });
            }
        }

        console.log(`Upserting ${upserts.length} balance rows...`);
        const { error } = await supabase.from('leave_balances').upsert(upserts, { onConflict: 'employee_id,leave_type,year' });
        if (error) {
            console.error("Upsert Error:", error.message);
        } else {
            console.log("Upsert successful. Now running recalculation...");
            // Run the recalculation logic from 003
            const recalcSql = `
           DO $$
           DECLARE
               emp RECORD;
               v_sick NUMERIC := 0;
               v_hajj NUMERIC := 0;
               v_business NUMERIC := 0;
               v_annual NUMERIC := 0;
               v_emergency NUMERIC := 0;
               v_short_perm NUMERIC := 0;
               
               calc_annual NUMERIC := 0;
               calc_sick NUMERIC := 0;
               calc_emergency NUMERIC := 0;
               calc_short_perm NUMERIC := 0;
               calc_hajj NUMERIC := 0;
           BEGIN
               FOR emp IN SELECT id FROM employees LOOP
                   WITH approved_leaves AS (
                       SELECT 
                           type, 
                           COALESCE(SUM(days), 0) as total_days,
                           COALESCE(SUM(duration_hours), 0) as total_hours
                       FROM leave_requests
                       WHERE employee_id = emp.id
                         AND status IN ('Manager_Approved', 'HR_Approved', 'HR_Finalized', 'Pushed_To_Payroll', 'Paid')
                       GROUP BY type
                   )
                   SELECT 
                       COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Annual'), 0),
                       COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Sick'), 0),
                       COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Emergency'), 0),
                       COALESCE((SELECT total_hours FROM approved_leaves WHERE type = 'ShortPermission'), 0),
                       COALESCE((SELECT total_days FROM approved_leaves WHERE type = 'Hajj'), 0),
                       COALESCE((SELECT SUM(
                           CASE WHEN type = 'ShortPermission' THEN total_hours / 8.0 ELSE total_days END
                       ) FROM approved_leaves WHERE type NOT IN ('Sick', 'Business', 'Hajj', 'Annual')), 0)
                   INTO v_annual, v_sick, v_emergency, v_short_perm, v_hajj, v_business;
           
                   calc_annual := v_annual + v_business;
                   calc_sick := v_sick;
                   calc_emergency := v_emergency;
                   calc_short_perm := v_short_perm;
                   calc_hajj := v_hajj;
           
                   UPDATE leave_balances SET used_days = ROUND(calc_annual, 2) WHERE employee_id = emp.id AND leave_type = 'Annual' AND year = 2026;
                   UPDATE leave_balances SET used_days = ROUND(calc_sick, 2) WHERE employee_id = emp.id AND leave_type = 'Sick' AND year = 2026;
                   UPDATE leave_balances SET used_days = ROUND(calc_emergency, 2) WHERE employee_id = emp.id AND leave_type = 'Emergency' AND year = 2026;
                   UPDATE leave_balances SET used_days = ROUND(calc_short_perm, 2) WHERE employee_id = emp.id AND leave_type = 'ShortPermission' AND year = 2026;
                   UPDATE leave_balances SET used_days = ROUND(calc_hajj, 2) WHERE employee_id = emp.id AND leave_type = 'Hajj' AND year = 2026;
               END LOOP;
           END;
           $$;
           `;
            const { error: rError } = await supabase.rpc('run_sql', { sql_query: recalcSql });
            if (rError) console.error("Recalc Error:", rError.message);
            else console.log("Recalculation finished.");
        }
    }

    fixBalances();
} catch (e) { console.error(e); }
