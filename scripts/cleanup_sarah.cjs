
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tjkapzlfvxgocfitusxb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U";

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupSarah() {
  const sarahId = '00000000-0000-0000-0000-000000000004';
  
  console.log("Investigating Sarah's overtime records for March 2026...");
  
  const { data: records, error } = await supabase
    .from('variable_compensation')
    .select('*')
    .eq('employee_id', sarahId)
    .eq('comp_type', 'OVERTIME')
    .ilike('notes', '%2026-03%');

  if (error) {
    console.error("Error fetching records:", error);
    return;
  }

  console.log(`Found ${records.length} records for Sarah in March.`);

  const dailyRecords = {};
  records.forEach(r => {
    // Extract date from notes: "Generated from Attendance ID: ... on 2026-03-XX"
    const match = r.notes.match(/on (\d{4}-\d{2}-\d{2})/);
    const date = match ? match[1] : 'Unknown';
    if (!dailyRecords[date]) dailyRecords[date] = [];
    dailyRecords[date].push(r);
  });

  console.log("Records per day:");
  Object.keys(dailyRecords).sort().forEach(date => {
    console.log(`${date}: ${dailyRecords[date].length} records`);
  });

  const idsToDelete = [];
  Object.keys(dailyRecords).forEach(date => {
    if (dailyRecords[date].length > 1) {
      // Keep only the first record for each day, delete the rest
      const duplicates = dailyRecords[date].slice(1).map(r => r.id);
      idsToDelete.push(...duplicates);
    }
  });

  if (idsToDelete.length > 0) {
     console.log(`Deleting ${idsToDelete.length} duplicate records for Sarah...`);
     const { error: delError } = await supabase
       .from('variable_compensation')
       .delete()
       .in('id', idsToDelete);
     
     if (delError) console.error("Deletion failed:", delError);
     else console.log("Success! Cleaned up Sarah's duplicates.");
  } else {
    console.log("No duplicates found for Sarah.");
  }
}

cleanupSarah().catch(console.error);
