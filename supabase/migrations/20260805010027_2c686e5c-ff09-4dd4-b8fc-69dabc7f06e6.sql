
UPDATE public.changelog_items 
SET descricao_legivel = REPLACE(descricao_legivel, '#XX', '#35')
WHERE descricao_legivel ILIKE '%Fotos e prints voltaram a ser lidos%';

UPDATE public.changelog_items 
SET descricao_legivel = REPLACE(descricao_legivel, '#XX', '#36')
WHERE descricao_legivel ILIKE '%Laudos em PDF escaneado agora são lidos%';

-- Garantir que os itens de infraestrutura estão com a classificação correta para aparecerem na seção criada anteriormente
UPDATE public.changelog_items 
SET classificacao = 'infra' 
WHERE descricao_legivel ILIKE '%Geração de imagens no chat%'
   OR descricao_legivel ILIKE '%Sandbox de execução de código%';
