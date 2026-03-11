-- 1. KPI Templates
CREATE TABLE IF NOT EXISTS kpi_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    role_name TEXT NOT NULL,
    kpis JSONB NOT NULL, -- Format: [{ "name": "...", "weight": 25 }]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Employee Evaluations
CREATE TABLE IF NOT EXISTS employee_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) NOT NULL,
    evaluator_id UUID REFERENCES employees(id) NOT NULL,
    quarter TEXT NOT NULL, -- eg. '2026-Q1'
    kpi_scores JSONB NOT NULL, -- Format: [{ "name": "...", "weight": 25, "score": 90 }]
    total_score NUMERIC NOT NULL,
    pro_rata_factor NUMERIC DEFAULT 1.0,
    calculated_kwd NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'PENDING_EXEC',
    -- Statuses: PENDING_EXEC -> PENDING_HR -> APPROVED_FOR_PAYROLL -> PROCESSED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Profit Bonus Pool
CREATE TABLE IF NOT EXISTS profit_bonus_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_name TEXT NOT NULL, -- eg. 'FY 2026 Annual'
    total_net_profit NUMERIC NOT NULL,
    recommended_pool_pct NUMERIC DEFAULT 5.0,
    approved_pool_amount NUMERIC NOT NULL,
    distribution_method TEXT DEFAULT 'EQUAL_SPLIT', -- EQUAL_SPLIT or PRO_RATA_SALARY
    eligibility_cutoff_date DATE NOT NULL,
    total_distributed NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'DRAFT',
    -- Statuses: DRAFT -> EXECUTIVE_APPROVED -> HR_PROCESSED -> PAID
    created_by UUID REFERENCES employees(id),
    approved_by UUID REFERENCES employees(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Employee Bonus Allocations
CREATE TABLE IF NOT EXISTS employee_bonus_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id UUID REFERENCES profit_bonus_pools(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) NOT NULL,
    allocated_amount NUMERIC NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
