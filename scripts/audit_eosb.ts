
import { supabase } from './src/services/supabaseClient.ts';

async function auditEOSB() {
    console.log('--- EOSB Data Audit ---');

    const { data: entries, error } = await supabase
        .from('journal_entries')
        .select('amount, finance_chart_of_accounts!inner(account_code)')
        .eq('finance_chart_of_accounts.account_code', '200300');

    if (error) {
        console.error('Error fetching entries:', error);
        return;
    }

    const total = entries?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
    console.log(`Total entries for 200300: ${entries?.length || 0}`);
    console.log(`Total amount in 200300 (Liability): ${total} KWD`);

    const { data: expEntries } = await supabase
        .from('journal_entries')
        .select('amount, finance_chart_of_accounts!inner(account_code)')
        .eq('finance_chart_of_accounts.account_code', '600800');

    const expTotal = expEntries?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
    console.log(`Total entries for 600800 (Expense): ${expEntries?.length || 0}`);
    console.log(`Total amount in 600800: ${expTotal} KWD`);
}

auditEOSB();
