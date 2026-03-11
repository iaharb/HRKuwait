
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tjkapzlfvxgocfitusxb.supabase.co', 'sb_publishable_dBSKcdqKKECL9XbyFTEm4Q_RXAvywc1');

// Mock dbService for the script
const dbService = {
    async getPayrollItems(runId) {
        const { data } = await supabase.from('payroll_items').select('*').eq('run_id', runId);
        return (data || []).map(d => ({
            id: d.id,
            runId: d.run_id,
            employeeId: d.employee_id,
            employeeName: d.employee_name,
            basicSalary: Number(d.basic_salary || 0),
            housingAllowance: Number(d.housing_allowance || 0),
            otherAllowances: Number(d.other_allowances || 0),
            overtimeAmount: Number(d.overtime_amount || 0),
            leaveDeductions: Number(d.leave_deductions || 0),
            sickLeavePay: Number(d.sick_leave_pay || 0),
            annualLeavePay: Number(d.annual_leave_pay || 0),
            performanceBonus: Number(d.performance_bonus || 0),
            companyBonus: Number(d.company_bonus || 0),
            shortPermissionDeductions: Number(d.short_permission_deductions || 0),
            pifssDeduction: Number(d.pifss_deduction || 0),
            pifssEmployerShare: Number(d.pifss_employer_share || 0),
            indemnityAccrual: Number(d.indemnity_accrual || 0),
            netSalary: Number(d.net_salary || 0),
            verifiedByHr: !!d.verified_by_hr,
            variance: Number(d.variance || 0)
        }));
    },
    async getEmployees() {
        const { data } = await supabase.from('employees').select('*');
        return data || [];
    }
};

async function generateJournalEntries(payrollRunId) {
    const { data: runObj, error: rError } = await supabase.from('payroll_runs').select('period_key').eq('id', payrollRunId).single();
    if (rError || !runObj) throw new Error("Could not find payroll run");

    let entryDate = new Date().toISOString();
    const dateMatch = runObj.period_key.match(/(\d{4})-(\d{1,2})/);
    if (dateMatch) {
        const year = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10);
        if (!isNaN(year) && !isNaN(month)) {
            entryDate = new Date(Date.UTC(year, month - 1, 28, 12, 0, 0)).toISOString();
        }
    }

    const payrollItems = await dbService.getPayrollItems(payrollRunId);
    const employees = await dbService.getEmployees();
    const { data: mappingRules, error: mrError } = await supabase.from('finance_mapping_rules').select('*');
    if (mrError) throw mrError;
    const { data: costCenters, error: ccError } = await supabase.from('finance_cost_centers').select('*');
    if (ccError) throw ccError;

    const journalEntries = [];
    payrollItems.forEach((item) => {
        const employee = employees.find((e) => e.id === item.employeeId);
        if (!employee) return;
        const isLocal = employee.nationality.toLowerCase() === 'kuwaiti';
        const empNationalityGroup = isLocal ? 'LOCAL' : 'EXPAT';
        const costCenter = costCenters.find((c) => c.department_id === employee.department);
        if (!costCenter) return;

        const partsDetails = [
            { type: 'basic_salary', amount: item.basicSalary },
            { type: 'housing_allowance', amount: item.housingAllowance },
            { type: 'other_allowances', amount: item.otherAllowances },
            { type: 'sick_leave', amount: item.sickLeavePay },
            { type: 'annual_leave', amount: item.annualLeavePay },
            { type: 'overtime', amount: item.overtimeAmount },
            { type: 'performance_bonus', amount: item.performanceBonus },
            { type: 'company_bonus', amount: item.companyBonus },
            { type: 'net_salary_payable', amount: item.netSalary },
            { type: 'pifss_employer_share', amount: item.pifssEmployerShare },
            { type: 'pifss_deduction', amount: item.pifssDeduction },
            { type: 'indemnity_accrual', amount: item.indemnityAccrual },
        ];

        partsDetails.forEach((part) => {
            if (part.amount <= 0) return;
            const matchedRules = mappingRules.filter(
                (r) =>
                    r.payroll_item_type === part.type &&
                    (r.nationality_group === empNationalityGroup || r.nationality_group === 'ALL')
            );
            matchedRules.forEach((rule) => {
                journalEntries.push({
                    payroll_run_id: payrollRunId,
                    employee_id: employee.id,
                    cost_center_id: costCenter.id,
                    gl_account_id: rule.gl_account_id,
                    amount: part.amount,
                    entry_date: entryDate,
                    entry_type: rule.credit_or_debit,
                    payroll_item_type: part.type,
                });
            });
        });
    });

    if (journalEntries.length > 0) {
        // Clear existing JVs for this run first (idempotency)
        await supabase.from('journal_entries').delete().eq('payroll_run_id', payrollRunId);
        const { error: insError } = await supabase.from('journal_entries').insert(journalEntries);
        if (insError) throw insError;
        await supabase.from('payroll_runs').update({ status: 'JV_Generated' }).eq('id', payrollRunId);
    }
}

async function verify() {
    const RUN_ID = '00000000-0000-0000-0000-000000003026';
    console.log('Generating Journal Entries...');
    await generateJournalEntries(RUN_ID);
    console.log('JVs Generated.');

    console.log('Checking view_financial_rollup...');
    const { data: rollup, error } = await supabase.from('view_financial_rollup').select('*').eq('payroll_run_id', RUN_ID);
    if (error) throw error;
    console.log(JSON.stringify(rollup, null, 2));
    process.exit();
}

verify().catch(e => { console.error(e); process.exit(1); });
