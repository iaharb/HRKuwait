-- Migration: Add effective_date to variable_compensation for precise payroll cutoff
ALTER TABLE variable_compensation ADD COLUMN IF NOT EXISTS effective_date DATE;

-- Backfill from notes if possible (Generated from Attendance ID: ... on YYYY-MM-DD)
UPDATE variable_compensation 
SET effective_date = (SUBSTRING(notes FROM 'on ([0-9]{4}-[0-9]{2}-[0-9]{2})'))::DATE
WHERE effective_date IS NULL AND notes LIKE 'Generated from Attendance % on %';

-- Fallback for others to created_at
UPDATE variable_compensation 
SET effective_date = created_at::DATE
WHERE effective_date IS NULL;

-- Keep NOT NULL for consistency in future
ALTER TABLE variable_compensation ALTER COLUMN effective_date SET NOT NULL;

-- Update the Attendance OT generation function to include effective_date
CREATE OR REPLACE FUNCTION process_attendance_overtime()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    shift_duration INTERVAL;
    ot_hours NUMERIC;
    standard_shift INTERVAL := '8 hours'::interval;
    ot_count INTEGER := 0;
BEGIN
    FOR rec IN 
      SELECT a.*
      FROM attendance a
      WHERE a.clock_in IS NOT NULL 
        AND a.clock_out IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM variable_compensation vc 
          WHERE vc.employee_id = a.employee_id 
            AND vc.comp_type = 'OVERTIME'
            AND vc.notes LIKE '%' || a.id || '%'
        )
    LOOP
        shift_duration := rec.clock_out::time - rec.clock_in::time;
        IF shift_duration > standard_shift THEN
            ot_hours := EXTRACT(EPOCH FROM (shift_duration - standard_shift)) / 3600;
            INSERT INTO variable_compensation (
              employee_id, comp_type, sub_type, amount, status, notes, effective_date
            ) VALUES (
              rec.employee_id, 'OVERTIME', 'Workday_OT', ot_hours, 'PENDING_MANAGER', 
              'Generated from Attendance ID: ' || rec.id || ' on ' || rec.date,
              rec.date -- The actual date of work
            );
            ot_count := ot_count + 1;
        END IF;
    END LOOP;
    RETURN ot_count;
END;
$$;
