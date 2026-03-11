CREATE OR REPLACE FUNCTION run_sql(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    EXECUTE sql_query;
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

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
