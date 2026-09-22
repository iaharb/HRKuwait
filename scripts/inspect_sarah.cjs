
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

  console.log(`Sarah has ${data.length} total overtime records.`);
  data.forEach((r, i) => {
    if (i < 100) {
      console.log(`${i}: id=${r.id}, status=${r.status}, notes=${r.notes}`);
    }
  });
}

inspectSarahDetails().catch(console.error);
