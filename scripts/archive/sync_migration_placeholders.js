import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const VITE_SUPABASE_URL = "https://tjkapzlfvxgocfitusxb.supabase.co";
const VITE_SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U";

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY);

async function sync() {
    const { data, error } = await supabase.rpc('run_sql', {
        sql_query: "SELECT version FROM supabase_migrations.schema_migrations"
    });

    if (error) {
        console.error(error);
        return;
    }

    console.log('Remote migrations:', data);
    for (const row of data) {
        const path = `supabase/migrations/${row.version}_remote.sql`;
        if (!fs.existsSync(path)) {
            fs.writeFileSync(path, '-- Remote placeholder');
            console.log(`Created placeholder: ${path}`);
        }
    }
}

sync();
