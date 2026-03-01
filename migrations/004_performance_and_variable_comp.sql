-- 004_performance_and_variable_comp.sql
-- Create performance evaluations and variable compensation tables for OT and Bonus workflows

CREATE TABLE IF NOT EXISTS performance_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    period_name VARCHAR(100) NOT NULL, -- e.g. "Annual 2025"
    rating_score NUMERIC(5,2),         -- e.g. 1.0 to 5.0
    recommended_bonus_pct NUMERIC(5,2), -- % of basic salary
    status VARCHAR(50) DEFAULT 'DRAFT', -- DRAFT, PENDING_EXEC, APPROVED, REJECTED
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(employee_id, period_name)
);

CREATE TABLE IF NOT EXISTS variable_compensation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    comp_type VARCHAR(50) NOT NULL, -- 'OVERTIME', 'BONUS'
    sub_type VARCHAR(100), -- 'Weekend_OT', 'Workday_OT', 'Performance_Bonus', 'Flat_Bonus'
    amount NUMERIC(10,3) NOT NULL, -- Hours (for OT) or KWD value (for Bonus)
    calculated_kwd NUMERIC(10,3), -- Final KWD value computed when sent to payroll
    status VARCHAR(50) DEFAULT 'PENDING_MANAGER', 
        -- PENDING_MANAGER, PENDING_EXEC, PENDING_HR, APPROVED_FOR_PAYROLL, PROCESSED
    pam_exempt BOOLEAN DEFAULT false,
    performance_evaluation_id UUID REFERENCES performance_evaluations(id) ON DELETE SET NULL,
    payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
    notes TEXT,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Give access to anon
GRANT ALL ON performance_evaluations TO anon, authenticated, service_role;
GRANT ALL ON variable_compensation TO anon, authenticated, service_role;
