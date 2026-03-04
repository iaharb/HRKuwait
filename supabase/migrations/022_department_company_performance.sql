-- 1. Department Evaluations
CREATE TABLE IF NOT EXISTS department_evaluations (
   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   department_name TEXT NOT NULL,
   evaluator_id UUID REFERENCES employees(id),
   quarter TEXT NOT NULL, -- eg. '2026-Q1'
   kpi_scores JSONB NOT NULL, -- Format: [{ "name": "...", "weight": 40, "score": 90 }]
   total_score NUMERIC NOT NULL,
   status TEXT DEFAULT 'PENDING_EXEC', 
   -- Statuses: PENDING_EXEC -> PENDING_HR -> APPROVED
   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Company Evaluations
CREATE TABLE IF NOT EXISTS company_evaluations (
   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   company_name TEXT NOT NULL DEFAULT 'Enterprise',
   evaluator_id UUID REFERENCES employees(id),
   quarter TEXT NOT NULL, -- eg. '2026-Q1'
   kpi_scores JSONB NOT NULL, -- Format: [{ "name": "...", "weight": 40, "score": 90 }]
   total_score NUMERIC NOT NULL,
   status TEXT DEFAULT 'PENDING_EXEC', 
   -- Statuses: PENDING_EXEC -> APPROVED
   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
