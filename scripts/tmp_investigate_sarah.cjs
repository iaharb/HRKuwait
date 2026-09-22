
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigate() {
  const sarahId = '00000000-0000-0000-0000-000000000004';
  
  // Fetch all overtime records for Sarah in March
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

  // Identify IDs to delete (keeping only the FIRST record for each day)
  const idsToDelete = [];
  Object.keys(dailyRecords).forEach(date => {
    if (dailyRecords[date].length > 1) {
      idsToDelete.push(...dailyRecords[date].slice(1).map(r => r.id));
    }
  });

  if (idsToDelete.length > 0) {
     console.log(`Deleting ${idsToDelete.length} duplicate records...`);
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

investigate().catch(console.error);
