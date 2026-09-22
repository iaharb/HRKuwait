
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tjkapzlfvxgocfitusxb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U";

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupAllEmployees() {
  console.log("Analyzing overtime records for March 2026 across all employees...");

  // 1. Fetch all March overtime records
  const { data: records, error } = await supabase
    .from('variable_compensation')
    .select('*')
    .eq('comp_type', 'OVERTIME')
    .ilike('notes', '%2026-03%');

  if (error) {
    console.error("Error fetching records:", error);
    return;
  }

  console.log(`Initial scan: Found ${records.length} total overtime records for March 2026.`);

  // 2. Group by employee, then by extracted date
  const employeesRecords = {};
  records.forEach(r => {
    if (!employeesRecords[r.employee_id]) {
      employeesRecords[r.employee_id] = {};
    }

    // Try to extract date from both known patterns
    let date = 'Unknown';
    // Pattern 1: Generated from Attendance ID: ... on 2026-03-12
    const match1 = r.notes.match(/on (\d{4}-\d{2}-\d{2})/);
    // Pattern 2: Auto-generated from logs for 2026-03-05. Total shift...
    const match2 = r.notes.match(/for (\d{4}-\d{2}-\d{2})/);
    
    if (match1) date = match1[1];
    else if (match2) date = match2[1];

    if (!employeesRecords[r.employee_id][date]) {
      employeesRecords[r.employee_id][date] = [];
    }
    employeesRecords[r.employee_id][date].push(r);
  });

  const idsToDelete = [];

  // 3. Identify duplicates (keep the first, discard the rest)
  Object.keys(employeesRecords).forEach(empId => {
    let duplicateCountForEmp = 0;
    const dates = employeesRecords[empId];
    
    Object.keys(dates).forEach(date => {
      // If there are multiple records for the same day, they are duplicates
      // Note: We ignore "Unknown" dates just to be safe, unless we know we want to purge them
      if (date !== 'Unknown' && dates[date].length > 1) {
        // Keep index 0, mark the rest for deletion
        const duplicates = dates[date].slice(1).map(r => r.id);
        idsToDelete.push(...duplicates);
        duplicateCountForEmp += duplicates.length;
      }
    });

    if (duplicateCountForEmp > 0) {
      console.log(`Employee ${empId}: found ${duplicateCountForEmp} duplicates.`);
    }
  });

  // 4. Perform Deletion
  if (idsToDelete.length > 0) {
    console.log(`\nExecuting deletion of ${idsToDelete.length} duplicate records...`);
    
    // Supabase .in() has a limit, batch in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize);
        console.log(`Processing chunk ${Math.floor(i/chunkSize) + 1} of ${Math.ceil(idsToDelete.length / chunkSize)}...`);
        
        const { error: delError } = await supabase
            .from('variable_compensation')
            .delete()
            .in('id', chunk);

        if (delError) {
            console.error("Deletion chunk failed:", delError);
        }
    }
    
    console.log("Success! Cleaned up overtime duplicates for all employees.");
  } else {
    console.log("No duplicates found across all employees.");
  }
}

cleanupAllEmployees().catch(console.error);
