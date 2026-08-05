
-- 1. Limpar itens para reinserção completa com descrições e datas corrigidas
DELETE FROM public.changelog_items WHERE round_id = 'e9aead72-8dcf-4276-aa00-09bb0c6218f5';

-- 2. Inserir itens com descrições completas e datas específicas
INSERT INTO public.changelog_items (round_id, descricao_legivel, item_data, classificacao, camada, descricao_tecnica, sort_order)
VALUES 
('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 '#9 — Prioridades não aparecem mais na Integração Fisiopatológica\n\nAs prioridades clínicas (🔴 Alta / 🟠 Moderada / 🟡 Investigativa) agora aparecem exclusivamente na Síntese Clínica. A Integração Fisiopatológica voltou a trazer apenas a correlação dos mecanismos, sem duplicar a informação. Aplicado nos perfis masculino e feminino.', 
 '2026-08-03', 'suporte', 'dify', 
 'Vazamento de priorização no Bloco 2. Instrução removida de 3 pontos por perfil. Validação: 3->0 ocorrências.', 1),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 '#XX — Fotos e prints voltaram a ser lidos\n\nImagens enviadas no chat estavam sendo recusadas com erro de formato em algumas funcionalidades. Agora são lidas normalmente em Exame, Casos Clínicos, Composição Corporal e Genética, nos quatro perfis.', 
 '2026-08-04', 'suporte', 'dify', 
 'Roteamento PDF/imagem corrigido. Sub-condição "type is document" removida. 16 pontos alterados.', 2),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 '#XX — Laudos em PDF escaneado agora são lidos\n\nLaudos exportados pelo aparelho de bioimpedância, PDFs escaneados e fotos de laudo impresso salvas em PDF recebiam a resposta "conteúdo não reconhecido como laudo". Agora o sistema identifica que o arquivo não tem texto e faz a leitura visual automaticamente. Testado com laudo laboratorial de 4 páginas e com laudo de bioimpedância, nos quatro perfis.', 
 '2026-08-04', 'suporte', 'dify', 
 'Gate de PDF sem camada de texto. Inserido nó Code + if-else. 8 nós novos por perfil.', 3),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 'Geração de imagens no chat voltou a funcionar\n\nImagens geradas pelo sistema apareciam quebradas. Corrigido no servidor.', 
 '2026-08-04', 'suporte', 'lovable', 
 'URL de arquivos duplicando o caminho corrigida no servidor.', 4),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 '#8 — Relações Clínicas agora têm seção própria no painel\n\nOs índices calculados a partir de outros marcadores passaram a ser exibidos em uma seção separada chamada "Relações Clínicas", logo após o Perfil Lipídico. Antes apareciam misturados aos marcadores medidos, sem distinção.\n\nNos perfis masculino e feminino, a seção reúne HOMA-IR, HOMA-β, TG/HDL, CT/HDL e LDL/HDL — e no feminino também E2:P4, N/L, Albumina/Globulina, TGO/TGP, FT3/rT3 e TF3/TF4. Nos perfis gestantes, reúne o HOMA-IR com a faixa gestacional própria. Os marcadores medidos diretamente permanecem em seus perfis de origem.', 
 '2026-08-05', 'melhoria', 'dify', 
 'Categoria relacoes_clinicas no agente. Enum ampliado 13->14. Posição após perfil_lipidico.', 5),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 'Troca de modelo nos LLM de visão para suporte a PDF\n\nO modelo anterior não processava PDF em visão; o novo processa. Descoberto em teste de 04/08 — o gate roteava corretamente, mas o nó de destino não enxergava o arquivo.', 
 '2026-08-04', 'melhoria', 'dify', 
 'LLM de visão migrados para modelo com suporte a PDF. completion_params preservados.', 6),

('e9aead72-8dcf-4276-aa00-09bb0c6218f5', 
 'Sandbox de execução de código configurado\n\nNós Code retornavam erro de DNS. Endpoint e chave de execução de código definidos em api e worker, permitindo que o gate de PDF seja viável.', 
 '2026-08-04', 'melhoria', 'lovable', 
 'Endpoint e chave de execução de código definidos em api e worker.', 7);
