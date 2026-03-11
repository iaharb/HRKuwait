
-- 1. RPC for Attendance Generation (Enterprise Simulation)
CREATE OR REPLACE FUNCTION generate_historical_attendance()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    emp RECORD;
    d DATE;
    clock_in TIME;
    clock_out TIME;
    lateness_chance NUMERIC;
    ot_chance NUMERIC;
BEGIN
    FOR emp IN SELECT id, name FROM employees LOOP
        FOR d IN SELECT generate_series('2026-01-01'::date, CURRENT_DATE, '1 day'::interval)::date LOOP
            IF EXTRACT(DOW FROM d) = 5 THEN CONTINUE; END IF;
            IF EXISTS (SELECT 1 FROM attendance WHERE employee_id = emp.id AND date = d) THEN CONTINUE; END IF;

            lateness_chance := random();
            IF lateness_chance < 0.25 THEN
                clock_in := '07:45:00'::time + (random() * interval '1 hour 45 minutes');
            ELSE
                clock_in := '07:15:00'::time + (random() * interval '25 minutes');
            END IF;

            ot_chance := random();
            IF ot_chance < 0.4 THEN
                clock_out := '16:30:00'::time + (random() * interval '4 hours');
            ELSE
                clock_out := '15:30:00'::time + (random() * interval '45 minutes');
            END IF;

            INSERT INTO attendance (id, employee_id, employee_name, date, clock_in, clock_out, location, status, source)
            VALUES (gen_random_uuid(), emp.id, emp.name, d, clock_in, clock_out, 'Al Hamra Tower HQ', 'On-Site', 'Hardware');
        END LOOP;
    END LOOP;
END;
$$;

-- 2. RPC for Overtime Processing
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
              employee_id, comp_type, sub_type, amount, status, notes
            ) VALUES (
              rec.employee_id, 'OVERTIME', 'Workday_OT', ot_hours, 'PENDING_MANAGER', 
              'Generated from Attendance ID: ' || rec.id || ' on ' || rec.date
            );
            ot_count := ot_count + 1;
        END IF;
    END LOOP;
    RETURN ot_count;
END;
$$;
