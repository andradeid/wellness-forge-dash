
DO $$
BEGIN
  ALTER TABLE public.changelog_items DROP CONSTRAINT IF EXISTS changelog_items_classificacao_check;
  ALTER TABLE public.changelog_items ADD CONSTRAINT changelog_items_classificacao_check CHECK (classificacao IN ('suporte', 'melhoria', 'infra'));
END $$;

UPDATE public.changelog_items 
SET classificacao = 'melhoria' 
WHERE descricao_legivel ILIKE 'Fotos e prints voltaram a ser lidos%';

UPDATE public.changelog_items 
SET classificacao = 'melhoria' 
WHERE descricao_legivel ILIKE 'Laudos em PDF escaneado%';

UPDATE public.changelog_items 
SET classificacao = 'infra' 
WHERE descricao_legivel ILIKE 'Geração de imagens no chat%';

UPDATE public.changelog_items 
SET classificacao = 'infra' 
WHERE descricao_legivel ILIKE 'Sandbox de execução de código%';
