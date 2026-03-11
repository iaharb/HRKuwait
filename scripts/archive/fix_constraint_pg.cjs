// Use pg module to connect directly to the Supabase Postgres database
// Connection string format: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

const { Client } = require('pg');

// For online Supabase, we need the database password
// The service role key isn't the DB password - we need to extract from the project settings
// Let's try the default connection approach

const projectRef = 'bvpqmejovjqcbxrcvwmf';

// Try using the pooler connection
const connectionString = `postgresql://postgres.${projectRef}:${process.argv[2] || 'YOUR_DB_PASSWORD'}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;

async function run() {
    if (!process.argv[2]) {
        console.log('Usage: node fix_constraint_pg.cjs <database_password>');
        console.log('');
        console.log('You can find the database password in the Supabase Dashboard:');
        console.log('  Project Settings > Database > Connection string');
        console.log('');
        console.log('Or alternatively, run this SQL in the Supabase SQL Editor:');
        console.log('');
        console.log(`ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check 
CHECK (status IN (
    'Pending', 
    'Pending_Manager', 
    'Manager_Approved', 
    'HR_Approved', 
    'HR_Finalized', 
    'Resumed', 
    'Rejected', 
    'Paid', 
    'Pushed_To_Payroll'
));`);
        process.exit(0);
        return;
    }

    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('Connected to database!');

        await client.query(`
            ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
        `);
        console.log('Old constraint dropped.');

        await client.query(`
            ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check 
            CHECK (status IN (
                'Pending', 
                'Pending_Manager', 
                'Manager_Approved', 
                'HR_Approved', 
                'HR_Finalized', 
                'Resumed', 
                'Rejected', 
                'Paid', 
                'Pushed_To_Payroll'
            ));
        `);
        console.log('New constraint added successfully!');

        // Also recreate the run_sql function while we're here
        await client.query(`
            CREATE OR REPLACE FUNCTION run_sql(sql_query text)
            RETURNS void
            LANGUAGE plpgsql
            SECURITY DEFINER
            AS $$
            BEGIN
              EXECUTE sql_query;
            END;
            $$;
            
            GRANT EXECUTE ON FUNCTION run_sql TO anon, authenticated, service_role;
        `);
        console.log('run_sql function created/updated!');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.end();
    }

    process.exit(0);
}
run();
