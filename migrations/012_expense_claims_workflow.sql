
-- 012_expense_claims_workflow.sql

-- 1. Create the expense_claims table
CREATE TABLE IF NOT EXISTS expense_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    merchant TEXT NOT NULL,
    amount DECIMAL(12, 3) NOT NULL,
    entry_date DATE NOT NULL,
    category TEXT,
    receipt_url TEXT, -- Can store base64 for now or a path
    status TEXT NOT NULL DEFAULT 'Draft',
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create the expense_claim_history table for auditing approvals
CREATE TABLE IF NOT EXISTS expense_claim_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID REFERENCES expense_claims(id) ON DELETE CASCADE,
    actor_id UUID, -- References app_users.id or system
    actor_name TEXT,
    actor_role TEXT,
    from_status TEXT,
    to_status TEXT,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Trigger for updated_at
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expense_claims_timestamp
BEFORE UPDATE ON expense_claims
FOR EACH ROW
EXECUTE FUNCTION fn_update_timestamp();

-- 4. Enable RLS (Security)
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_claim_history ENABLE ROW LEVEL SECURITY;

-- Allow all for now as per current project pattern (to be tightened later)
CREATE POLICY "Allow All" ON expense_claims FOR ALL USING (true);
CREATE POLICY "Allow All History" ON expense_claim_history FOR ALL USING (true);
