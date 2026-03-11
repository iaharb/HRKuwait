
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tjkapzlfvxgocfitusxb.supabase.co', 'sb_publishable_dBSKcdqKKECL9XbyFTEm4Q_RXAvywc1');

async function verify() {
    const EMP_ID = '00000000-0000-0000-0000-000000000001'; // Ahmed Al-Mutairi
    const MGR_ID = '00000000-0000-0000-0000-000000000000'; // Admin
    const QUARTER = '2026-Q1';

    console.log('--- Step 1: Creating Evaluation ---');
    const { data: eval, error: e1 } = await supabase.from('employee_evaluations').insert([{
        employee_id: EMP_ID,
        evaluator_id: MGR_ID,
        quarter: QUARTER,
        kpi_scores: [{ name: 'SLA', score: 100, weight: 100 }],
        total_score: 100,
        pro_rata_factor: 1.0,
        calculated_kwd: 250.000,
        status: 'PENDING_EXEC'
    }]).select().single();
    if (e1) throw e1;
    console.log('Evaluation Created:', eval.id);

    console.log('--- Step 2: Approving Evaluation ---');
    // We simulate the logic in updateEvaluationStatus
    await supabase.from('employee_evaluations').update({ status: 'APPROVED_FOR_PAYROLL' }).eq('id', eval.id);
    await supabase.from('variable_compensation').insert([{
        employee_id: EMP_ID,
        comp_type: 'PERFORMANCE_BONUS',
        sub_type: QUARTER,
        amount: 250.000,
        status: 'APPROVED_FOR_PAYROLL',
        notes: `TEST: Quarterly Performance Bonus for ${QUARTER}`
    }]);
    console.log('Approved and Variable Comp injected.');

    console.log('--- Step 3: Checking Variable Compensation ---');
    const { data: vc } = await supabase.from('variable_compensation').select('*').eq('employee_id', EMP_ID).eq('status', 'APPROVED_FOR_PAYROLL');
    console.log('Variable Comp Records:', vc.length);

    console.log('--- Step 4: Simulating Payroll Update for 2026-03 ---');
    // We simulate what generatePayrollRun would do
    const RUN_ID = '00000000-0000-0000-0000-000000003026';
    const { data: pi, error: e4 } = await supabase.from('payroll_items').update({
        performance_bonus: 250.000
    }).eq('run_id', RUN_ID).eq('employee_id', EMP_ID);

    if (e4) console.warn('Update failed, maybe column missing in DB?', e4.message);
    else console.log('Payroll Item updated with Performance Bonus.');

    console.log('--- Step 5: Finalizing Run & Generating JV ---');
    await supabase.from('payroll_runs').update({ status: 'Finalized' }).eq('id', RUN_ID);

    // Here we would normally call the financeUtils.generateJournalEntries
    // But we can check the payroll item in DB first
    const { data: item } = await supabase.from('payroll_items').select('performance_bonus').eq('run_id', RUN_ID).eq('employee_id', EMP_ID).single();
    console.log('Final Performance Bonus in Payroll Item:', item?.performance_bonus);

    process.exit();
}

verify().catch(e => { console.error(e); process.exit(1); });
