import { supabase } from '../services/supabaseClient';

async function checkRules() {
    const { data: rules, error } = await supabase.from('finance_mapping_rules').select('*');
    if (error) {
        console.error('Error fetching rules:', error);
        return;
    }
    console.log(JSON.stringify(rules, null, 2));
}

checkRules();
