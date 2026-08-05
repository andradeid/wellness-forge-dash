
-- 1. Atualizar Metadados da Rodada 1
UPDATE public.changelog_rounds 
SET 
  rodada_data = '2026-08-05',
  notas_curador = 'As prioridades clínicas (🔴 Alta / 🟠 Moderada / 🟡 Investigativa) agora aparecem exclusivamente na Síntese Clínica. A Integração Fisiopatológica voltou a trazer apenas a correlação dos mecanismos, sem duplicar a informação.',
  notas_admin = 'Resumo da rodada: Vazamento de priorização no Bloco 2 (#9), Roteamento PDF/imagem, Gate de PDF sem camada de texto, Troca de modelo nos LLM de visão, Categoria relacoes_clinicas (#8), Sandbox de execução de código e Correção de URL de arquivos.'
WHERE id = 'e9aead72-8dcf-4276-aa00-09bb0c6218f5';

-- 2. Limpar itens antigos da Rodada 1 para reinserir conforme a nova especificação
DELETE FROM public.changelog_items WHERE round_id = 'e9aead72-8dcf-4276-aa00-09bb0c6218f5';

-- 3. Inserir itens da Rodada 1 (Legíveis + Técnicos)
INSERT INTO public.changelog_items (round_id, descricao_legivel, classificacao, camada, descricao_tecnica, sort_order)
VALUES 
('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 '#9 — Prioridades não aparecem mais na Integração Fisiopatológica', 
 'suporte', 'dify', 
 'Vazamento de priorização no Bloco 2. Instrução removida de 3 pontos por perfil. Validação: 3->0 ocorrências.', 1),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 '#XX — Fotos e prints voltaram a ser lidos', 
 'suporte', 'dify', 
 'Roteamento PDF/imagem corrigido. Sub-condição "type is document" removida. 16 pontos alterados.', 2),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 '#XX — Laudos em PDF escaneado agora são lidos', 
 'suporte', 'dify', 
 'Gate de PDF sem camada de texto. Inserido nó Code + if-else. 8 nós novos por perfil.', 3),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 'Geração de imagens no chat voltou a funcionar', 
 'suporte', 'lovable', 
 'URL de arquivos duplicando o caminho corrigida no servidor.', 4),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 '#8 — Relações Clínicas agora têm seção própria no painel', 
 'melhoria', 'dify', 
 'Categoria relacoes_clinicas no agente. Enum ampliado 13->14. Posição após perfil_lipidico.', 5),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 'Troca de modelo nos LLM de visão para suporte a PDF', 
 'melhoria', 'dify', 
 'LLM de visão migrados para modelo com suporte a PDF. completion_params preservados.', 6),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 'Sandbox de execução de código configurado', 
 'melhoria', 'lovable', 
 'Endpoint e chave de execução de código definidos em api e worker.', 7);

-- 4. Vincular reports específicos se existirem (ex: #9 e #8)
-- O ID 8c7536e6 refere-se ao #9 e 7546e88c ao #8 conforme o prompt
-- Nota: assumindo que o request_id existe ou ignorando se falhar (precisão manual)
