const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://tjkapzlfvxgocfitusxb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U');

async function main() {
    const { data, error } = await supabase
        .from('payroll_runs')
        .select('*, payroll_items(*)')
        .ilike('period_key', '%SARAH%');
    
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}
main();
