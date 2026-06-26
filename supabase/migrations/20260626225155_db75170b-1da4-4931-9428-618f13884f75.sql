ALTER TYPE public.plan_type RENAME VALUE 'basic' TO 'starter';
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'clinica';