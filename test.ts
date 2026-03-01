import { supabase } from './src/services/supabaseClient.ts';

async function test() {
    const selectedRowId = '00000000-0000-0000-0000-000000000001';
    const bal = await supabase.from('leave_balances').select('*').eq('employee_id', selectedRowId);
    console.log("leave_balances ERROR:", bal.error);
    console.log("leave_balances DATA:", bal.data);
}

test();
