
-- 024_add_attendance_unique_constraint.sql
-- Ensure one record per employee per day to support upsert/hardware sync

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendance_employee_date_key'
    ) THEN
        ALTER TABLE attendance ADD CONSTRAINT attendance_employee_date_key UNIQUE (employee_id, date);
    END IF;
END $$;
