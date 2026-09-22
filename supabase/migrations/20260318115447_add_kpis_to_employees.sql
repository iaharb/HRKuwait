ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS kpi_template_ids text[] DEFAULT '{}'::text[];
