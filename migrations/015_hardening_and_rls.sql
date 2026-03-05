
-- 1. ENABLE ROW LEVEL SECURITY DYNAMICALLY
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Full Access" ON %I', t);
        EXECUTE format('CREATE POLICY "Full Access" ON %I FOR ALL USING (true)', t);
    END LOOP;
END $$;

-- 2. PERMISSIONS (Ensuring everything is accessible by anon/authenticated for now)
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 3. ATOMIC BUSINESS LOGIC (RPCs) - Moving fragile frontend code to backend

-- A. Payroll Generation Logic
CREATE OR REPLACE FUNCTION generate_payroll_draft(p_period_key TEXT, p_cycle_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_run_id UUID;
    v_total_disbursement NUMERIC := 0;
BEGIN
    -- Delete existing draft for this period
    DELETE FROM payroll_runs WHERE period_key = p_period_key AND status = 'Draft';

    v_run_id := gen_random_uuid();

    -- Insert Run
    INSERT INTO payroll_runs (id, period_key, cycle_type, status, created_at)
    VALUES (v_run_id, p_period_key, p_cycle_type, 'Draft', NOW());

    -- Bulk Insert Items (Simplified logic for now, using existing table values)
    INSERT INTO payroll_items (
        run_id, employee_id, employee_name, basic_salary, housing_allowance, 
        other_allowances, net_salary, verified_by_hr, created_at
    )
    SELECT 
        v_run_id, e.id, e.name, e.salary, 
        COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = true), 0),
        COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id AND is_housing = false), 0),
        e.salary + COALESCE((SELECT SUM(value) FROM employee_allowances WHERE employee_id = e.id), 0),
        FALSE,
        NOW()
    FROM employees e
    WHERE e.status = 'Active';

    -- Update total
    UPDATE payroll_runs 
    SET total_disbursement = (SELECT SUM(net_salary) FROM payroll_items WHERE run_id = v_run_id)
    WHERE id = v_run_id
    RETURNING total_disbursement INTO v_total_disbursement;

    RETURN jsonb_build_object('id', v_run_id, 'total', v_total_disbursement);
END;
$$;

-- B. Finalize Settlement Logic
CREATE OR REPLACE FUNCTION finalize_payroll_run(p_run_id UUID, p_actor_name TEXT, p_actor_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE payroll_runs SET status = 'Finalized' WHERE id = p_run_id;
    
    -- Lock variable compensation
    UPDATE variable_compensation 
    SET status = 'PROCESSED', payroll_run_id = p_run_id 
    WHERE status = 'APPROVED_FOR_PAYROLL' AND payroll_run_id IS NULL;

    -- Update leave requests matched to this run
    UPDATE leave_requests
    SET status = 'Paid'
    WHERE (status = 'HR_Finalized' OR status = 'Pushed_To_Payroll')
      AND id IN (
          SELECT id FROM leave_requests WHERE status IN ('HR_Finalized', 'Pushed_To_Payroll')
      );
END;
$$;

-- 4. FINAL STEP: REMOVE BACKDOOR
DROP FUNCTION IF EXISTS run_sql(text);
