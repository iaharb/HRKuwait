
-- Migration 010: Profile Change Requests
-- Enables self-service profile edits with HR oversight.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

CREATE TABLE IF NOT EXISTS profile_change_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    field_name TEXT NOT NULL, -- e.g., 'phone', 'emergency_contact', 'iban'
    old_value TEXT,
    new_value TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    hr_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS
ALTER TABLE profile_change_requests DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE profile_change_requests TO anon, authenticated, service_role;

-- Force Cache Reload
NOTIFY pgrst, 'reload schema';
