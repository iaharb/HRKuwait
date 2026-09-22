const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://tjkapzlfvxgocfitusxb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const res = await fetch("https://tjkapzlfvxgocfitusxb.supabase.co/rest/v1/", {
        headers: { apikey: supabaseKey }
    });
    const schema = await res.json();
    const rpcs = Object.keys(schema.paths).filter(p => p.startsWith('/rpc/'));
    console.log(rpcs);
    
    // Attempt insert into a random row to maybe trigger schema refresh? No, only DDL does that automatically if at all.
}
check();
