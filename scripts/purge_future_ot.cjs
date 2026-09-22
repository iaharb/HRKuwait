
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tjkapzlfvxgocfitusxb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U";

const supabase = createClient(supabaseUrl, supabaseKey);

async function purgeFutureOT() {
  console.log("Removing any overtime generated for dates > March 17, 2026...");
  
  // 1. Fetch any March records
  const { data: records, error } = await supabase
    .from('variable_compensation')
    .select('*')
    .eq('comp_type', 'OVERTIME')
    .ilike('notes', '%2026-03%');

  if (error) {
    console.error(error);
    return;
  }

  const idsToDelete = [];
  records.forEach(r => {
    let date = null;
    let match = r.notes.match(/on (\d{4}-\d{2}-\d{2})|for (\d{4}-\d{2}-\d{2})/);
    if (match) {
        date = match[1] || match[2];
        // If the date is 2026-03-18 or greater, we should delete it
        if (date >= '2026-03-18') {
            idsToDelete.push(r.id);
        }
    } else if (r.effective_date && r.effective_date >= '2026-03-18') {
        idsToDelete.push(r.id);
    }
  });

  if (idsToDelete.length > 0) {
    console.log(`Deleting ${idsToDelete.length} future OT records...`);
    const { error: delError } = await supabase
       .from('variable_compensation')
       .delete()
       .in('id', idsToDelete);
       
    if (delError) console.error("Deletion failed:", delError);
    else console.log("Success! Future OT records cleaned up.");
  } else {
    console.log("No future OT found.");
  }

  // Also remove from attendance to stop them from coming back
  const { error: attError } = await supabase
    .from('attendance')
    .delete()
    .gte('date', '2026-03-18');
  if (attError) console.log("Error cleaning future attendance:", attError);
  else console.log("Also cleaned future generated attendance to prevent regeneration.");
}

purgeFutureOT().catch(console.error);
