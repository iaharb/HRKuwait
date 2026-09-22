const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tjkapzlfvxgocfitusxb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runFixes() {
    try {
        console.log("1. Reloading PostgREST Schema Cache...");
        // Assuming we have run_sql RPC, if not, wait 1-2 minutes usually fixes it for Supabase cloud but let's try RPC
        const { error: rpcErr } = await supabase.rpc('run_sql', { sql_query: "NOTIFY pgrst, 'reload schema';" });
        if (rpcErr) console.log("RPC warning (might not exist):", rpcErr.message);
        else console.log("Schema cache reloaded.");

        console.log("2. Cleaning up duplicate KPI templates...");
        const { data: templates, error: fetchErr } = await supabase.from('kpi_templates').select('id, title');
        if (fetchErr) throw fetchErr;

        const titleMap = {};
        const idsToDelete = [];

        for (const t of templates) {
            if (!titleMap[t.title]) {
                titleMap[t.title] = t.id; // Keep the first one
            } else {
                idsToDelete.push(t.id); // Mark subsequent ones for deletion
            }
        }

        if (idsToDelete.length > 0) {
            console.log(`Deleting ${idsToDelete.length} duplicate KPI templates...`);
            const { error: delErr } = await supabase.from('kpi_templates').delete().in('id', idsToDelete);
            if (delErr) throw delErr;
            console.log("Duplicates deleted.");
        } else {
            console.log("No duplicate KPI templates found.");
        }

        console.log("Done!");
    } catch (e) {
        console.error("Fatal Error:", e);
    }
}

runFixes();
