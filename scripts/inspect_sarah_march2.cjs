
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tjkapzlfvxgocfitusxb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSarahDetails() {
  const sarahId = '00000000-0000-0000-0000-000000000004';
  const { data, error } = await supabase
    .from('variable_compensation')
    .select('*')
    .eq('employee_id', sarahId)
    .eq('comp_type', 'OVERTIME');

  if (error) {
    console.error(error);
    return;
  }

  // Count those created in March
  const marchRecords = data.filter(r => r.created_at && r.created_at.startsWith('2026-03'));
  console.log(`Sarah has ${marchRecords.length} overtime records created in March 2026.`);
  
  marchRecords.forEach((r, i) => {
    if (i < 30) {
      console.log(`${i}: id=${r.id}, created=${r.created_at}, notes=${r.notes}`);
    }
  });
}

inspectSarahDetails().catch(console.error);
