const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tjkapzlfvxgocfitusxb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    try {
        const { data, error } = await supabase.from('employees').select('id, kpi_template_ids').limit(1);
        if (error) {
            console.error("Query Error:", error.message);
        } else {
            console.log("Success:", data);
        }
    } catch (e) {
        console.error("Fatal Error:", e);
    }
}

testQuery();
