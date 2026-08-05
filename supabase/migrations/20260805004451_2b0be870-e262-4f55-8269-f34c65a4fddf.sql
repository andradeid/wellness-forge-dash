
-- 1. Adicionar data de conclusão por item
ALTER TABLE public.changelog_items ADD COLUMN IF NOT EXISTS item_data DATE DEFAULT CURRENT_DATE;

-- 2. Adicionar campos de período na rodada (opcional, ou usamos rodada_data como início)
-- Vamos adicionar rodada_data_fim para o intervalo
ALTER TABLE public.changelog_rounds ADD COLUMN IF NOT EXISTS rodada_data_fim DATE;

-- 3. Atualizar dados da Rodada 1
UPDATE public.changelog_rounds 
SET 
  rodada_data = '2026-08-03',
  rodada_data_fim = '2026-08-05',
  notas_curador = NULL -- Remover seção "Em análise" do banco
WHERE id = 'e9aead72-8dcf-4276-aa00-09bb0c6218f5';

-- 4. Atualizar datas dos itens da Rodada 1
UPDATE public.changelog_items SET item_data = '2026-08-03' WHERE round_id = 'e9aead72-8dcf-4276-aa00-09bb0c6218f5' AND descricao_legivel ILIKE '%#9%';
UPDATE public.changelog_items SET item_data = '2026-08-04' WHERE round_id = 'e9aead72-8dcf-4276-aa00-09bb0c6218f5' AND (descricao_legivel ILIKE '%roteamento%' OR descricao_legivel ILIKE '%PDF%');
UPDATE public.changelog_items SET item_data = '2026-08-05' WHERE round_id = 'e9aead72-8dcf-4276-aa00-09bb0c6218f5' AND item_data IS NULL; -- Fallback para os outros
