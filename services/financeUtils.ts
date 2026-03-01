/* src/utils/financeUtils.ts */
import { supabase } from './supabaseClient';
import { dbService } from './dbService';
import type { PayrollItem, JournalEntry, Employee } from '../types';

/**
 * Generate journal entries for a given payroll run.
 * Evaluates payroll items against Smart Rules (accounting for Kuwaiti vs Expat)
 * and maps them to the appropriate GL Account and Cost Center.
 */
export async function generateJournalEntries(payrollRunId: string): Promise<void> {

    // 0. Fetch the payroll run to determine the correct entry_date (end of the period month)
    const { data: runObj, error: rError } = await supabase.from('payroll_runs').select('period_key').eq('id', payrollRunId).single();
    if (rError || !runObj) throw new Error("Could not find payroll run");

    let entryDate = new Date().toISOString();
    const parts = runObj.period_key.split('-'); // e.g. "2026-01-MONTHLY" or "2026-1"
    if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (!isNaN(year) && !isNaN(month)) {
            // Set date to the middle of the last day of the run's month to avoid timezone bleeding
            entryDate = new Date(Date.UTC(year, month, 0, 12, 0, 0)).toISOString();
        }
    }

    // 1. Fetch payroll items for the run
    const payrollItems: PayrollItem[] = await dbService.getPayrollItems(payrollRunId);

    // 2. Fetch all employees (to resolve nationality and department)
    const employees: Employee[] = await dbService.getEmployees();

    // 3. Fetch finance mapping rules
    const { data: mappingRules, error: mrError } = await supabase.from('finance_mapping_rules').select('*');
    if (mrError) throw mrError;

    // 4. Fetch finance cost centers
    const { data: costCenters, error: ccError } = await supabase.from('finance_cost_centers').select('*');
    if (ccError) throw ccError;

    // 5. Build journal entry objects
    const journalEntries: JournalEntry[] = [];

    payrollItems.forEach((item) => {
        const employee = employees.find((e) => e.id === item.employeeId);
        if (!employee) return;

        // Categorize Nationality for Kuwait Rules
        const isLocal = employee.nationality.toLowerCase() === 'kuwaiti';
        const empNationalityGroup = isLocal ? 'LOCAL' : 'EXPAT';

        // Find cost center for employee's department
        const costCenter = (costCenters as any[]).find((c) => c.department_id === employee.department);
        if (!costCenter) return;

        // Define the mapping between payroll item parts and the rule 'payroll_item_type' expected
        const partsDetails = [
            { type: 'basic_salary', amount: item.basicSalary },
            { type: 'housing_allowance', amount: item.housingAllowance },
            { type: 'other_allowances', amount: item.otherAllowances },
            { type: 'sick_leave', amount: item.sickLeavePay }, // Added
            { type: 'annual_leave', amount: item.annualLeavePay }, // Added
            { type: 'net_salary_payable', amount: item.netSalary },
            { type: 'pifss_employer_share', amount: item.pifssEmployerShare },
            { type: 'pifss_deduction', amount: item.pifssDeduction },
        ];

        partsDetails.forEach((part) => {
            if (part.amount <= 0) return; // Skip if there is no amount for this part

            // Find ALL matching rules based on part type AND nationality group
            const matchedRules = (mappingRules as any[]).filter(
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
                } as JournalEntry);
            });
        });
    });

    // 6. Bulk insert journal entries
    if (journalEntries.length > 0) {
        // First delete any existing entries for this run to avoid duplicates on regeneration
        await supabase.from('journal_entries').delete().eq('payroll_run_id', payrollRunId);

        const { error: insertError } = await supabase.from('journal_entries').insert(journalEntries);
        if (insertError) throw insertError;
    }
}