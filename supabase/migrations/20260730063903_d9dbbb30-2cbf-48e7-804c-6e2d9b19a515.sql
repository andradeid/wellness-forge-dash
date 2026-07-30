ALTER TABLE public.curation_requests
  ADD COLUMN IF NOT EXISTS curator_classification text,
  ADD COLUMN IF NOT EXISTS curator_dimension text;

ALTER TABLE public.curation_requests
  ADD CONSTRAINT curation_requests_curator_classification_check
  CHECK (curator_classification IS NULL OR curator_classification = ANY (ARRAY['suporte'::text, 'melhoria'::text]));

ALTER TABLE public.curation_requests
  ADD CONSTRAINT curation_requests_curator_dimension_check
  CHECK (curator_dimension IS NULL OR curator_dimension = ANY (ARRAY['comportamento'::text, 'tabela_dado'::text, 'formatacao'::text, 'clinico'::text, 'outro'::text]));