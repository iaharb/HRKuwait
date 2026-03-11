
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function calculateOvertime() {
    console.log('Calculating overtime from logs...');

    // Fetch all attendance logs for 2026
    const { data: logs, error } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', '2026-01-01');

    if (error) {
        console.error('Error fetching logs:', error);
        return;
    }

    const overtimeEntries = [];
    for (const log of logs) {
        if (!log.clock_in || !log.clock_out) continue;

        const inTime = new Date(`1970-01-01T${log.clock_in}`);
        const outTime = new Date(`1970-01-01T${log.clock_out}`);

        // Total hours
        const totalHours = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);

        // Overtime > 8 hours
        if (totalHours > 8) {
            const otHours = totalHours - 8;
            overtimeEntries.push({
                employee_id: log.employee_id,
                comp_type: 'OVERTIME',
                sub_type: 'Workday_OT',
                amount: Number(otHours.toFixed(2)),
                status: 'PENDING_MANAGER',
                notes: `Auto-generated from logs for ${log.date}. Total shift: ${totalHours.toFixed(2)}h`,
                metadata: { attendance_id: log.id, date: log.date }
            });
        }
    }

    if (overtimeEntries.length > 0) {
        const { error: otError } = await supabase.from('variable_compensation').upsert(overtimeEntries);
        if (otError) console.error('Error inserting OT entries:', otError);
        else console.log(`Created ${overtimeEntries.length} overtime entries.`);
    } else {
        console.log('No overtime detected in logs.');
    }

    console.log('Calculation finished.');
}

calculateOvertime();
