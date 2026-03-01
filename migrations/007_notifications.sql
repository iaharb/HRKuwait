-- 1. Create Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK (type IN ('urgent', 'reminder', 'success', 'info')),
    category TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    is_read BOOLEAN DEFAULT FALSE,
    link_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Disable RLS and grant permissions
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE notifications TO anon, authenticated, service_role;

-- 3. Seed some welcome notifications for Faisal
DO $$
DECLARE
    faisal_id UUID;
BEGIN
    SELECT id INTO faisal_id FROM employees WHERE name = 'Dr. Faisal Al-Sabah' LIMIT 1;
    IF faisal_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, title, message, type, category)
        VALUES (faisal_id, 'System Ready', 'Welcome to the new HR Portal. Local registry is now live.', 'success', 'payroll_alert'),
               (faisal_id, 'Security Update', 'Please review the new role hierarchy in Security & Roles.', 'info', 'pending_approval');
    END IF;
END $$;
