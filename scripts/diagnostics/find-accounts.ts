import { supabase } from '../services/supabaseClient';

async function findAccounts() {
    const { data: accounts, error } = await supabase.from('finance_chart_of_accounts').select('*').in('account_code', ['600500', '600600']);
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log(JSON.stringify(accounts, null, 2));
}

findAccounts();
