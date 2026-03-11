const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));
const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

const sql = `
CREATE OR REPLACE FUNCTION rollback_payroll_run_rpc(p_period_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run RECORD;
BEGIN
    FOR v_run IN 
        SELECT id, target_leave_id FROM payroll_runs WHERE period_key LIKE p_period_key || '%'
    LOOP
        -- Delete JVs
        DELETE FROM journal_entries WHERE payroll_run_id = v_run.id;
        
        -- Unpin VC
        UPDATE variable_compensation SET payroll_run_id = NULL WHERE payroll_run_id = v_run.id;
        
        -- Put Leaves back to HR_Finalized
        IF v_run.target_leave_id IS NOT NULL THEN
            UPDATE leave_requests SET status = 'HR_Finalized' 
            WHERE id = v_run.target_leave_id AND status IN ('Paid', 'Pushed_To_Payroll');
        END IF;
    END LOOP;

    -- Delete Runs
    DELETE FROM payroll_runs WHERE period_key LIKE p_period_key || '%';
    
    RETURN jsonb_build_object('success', true, 'message', 'Payroll records purged securely via backend registry.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
`;

async function main() {
    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) { console.error(error); process.exit(1); }
    console.log("Deployed rollback_payroll_run_rpc.");
    process.exit(0);
}
main();
