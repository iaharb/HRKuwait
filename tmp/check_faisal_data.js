
import { createClient } from '@supabase/supabase-js';
import process from 'process';

const supabase = createClient("https://tjkapzlfvxgocfitusxb.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjU0MjIsImV4cCI6MjA4NTcwMTQyMn0.sZVL7JE8aG8geFzC2z-_xRjMkozSQoIb1Tvohmk53c0");

async function checkFaisal() {
    const faisalId = '00000000-0000-0000-0000-000000000001';
    
    // 1. Employee Data
    const { data: emp } = await supabase.from('employees').select('*').eq('id', faisalId).single();
    console.log('--- Faisal Employee Data ---');
    console.log(JSON.stringify(emp, null, 2));

    // 2. Leave Balances
    const { data: balances } = await supabase.from('leave_balances').select('*').eq('employee_id', faisalId);
    console.log('\n--- Faisal Leave Balances (Table) ---');
    console.log(JSON.stringify(balances, null, 2));

    // 3. Payroll Items
    const { data: items } = await supabase.from('payroll_items').select('*, payroll_runs(period_key, status)').eq('employee_id', faisalId).order('created_at', { ascending: false });
    console.log('\n--- Faisal Payroll Items ---');
    console.log(JSON.stringify(items, null, 2));

    // 4. Variable Comp
    const { data: vComp } = await supabase.from('variable_compensation').select('*').eq('employee_id', faisalId);
    console.log('\n--- Faisal Variable Comp ---');
    console.log(JSON.stringify(vComp, null, 2));
}

checkFaisal();
