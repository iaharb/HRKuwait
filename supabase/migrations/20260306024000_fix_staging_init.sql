-- FIX STAGING INIT
-- Ensure legacy tables exist for the normalize migration to work.

CREATE TABLE IF NOT EXISTS department_configs (
    dept_name TEXT PRIMARY KEY,
    target_ratio NUMERIC,
    headcount_goal INTEGER,
    manager_id UUID
);

CREATE TABLE IF NOT EXISTS department_metrics (
    name TEXT PRIMARY KEY,
    name_arabic TEXT,
    kuwaiti_count INTEGER,
    expat_count INTEGER,
    target_ratio NUMERIC
);
