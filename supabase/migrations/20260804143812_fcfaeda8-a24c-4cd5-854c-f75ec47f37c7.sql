-- 1. Alter Schema
ALTER TABLE public.changelog_rounds 
ADD COLUMN IF NOT EXISTS notas_curador TEXT,
ADD COLUMN IF NOT EXISTS notas_admin TEXT;

COMMENT ON COLUMN public.changelog_rounds.notas_curador IS 'Visível ao curador (bloco Em análise)';
COMMENT ON COLUMN public.changelog_rounds.notas_admin IS 'Visível apenas ao super admin (Pendências e Arquivos)';

-- 2. Insert Round 1
DO $$
DECLARE
    v_round_id UUID;
    v_item1_id UUID;
    v_item2_id UUID;
    v_report_id UUID;
BEGIN
    SELECT id INTO v_report_id FROM public.curation_requests WHERE id::text LIKE '8c7536e6%' LIMIT 1;

    INSERT INTO public.changelog_rounds (
        titulo, 
        rodada_data, 
        notas_curador, 
        notas_admin
    ) VALUES (
        'Rodada 1',
        '2026-08-03',
        'Prioridades no perfil gestante: a estrutura da resposta é diferente nas gestantes e exige ajuste próprio. Em avaliação.',
        '**Pendências desta rodada**' || chr(10) || 
        '- Criar report retroativo para o roteamento PDF/imagem (corrigido sem registro formal na curadoria), já marcado como concluído.' || chr(10) || 
        '- PDF contendo apenas imagem (ex.: laudo de bioimpedância) continua falhando: é .pdf legítimo, vai ao Extrator e retorna vazio. Exige gate estrutural (nó novo), não resolvido nesta rodada.' || chr(10) || 
        '- Prioridades no perfil gestante: aguardando definição de arquitetura própria antes de aplicar (Bloco 2, arquitetura B).' || chr(10) || chr(10) ||
        '**Arquivos gerados**' || chr(10) || 
        '- arquiteturas_bloco2_exame_2026-08-03.md' || chr(10) || 
        '- combinado_masculino_2026-08-03_v1.yaml' || chr(10) || 
        '- combinado_feminino_2026-08-03_v1.yaml' || chr(10) || 
        '- combinado_gestante_mono_2026-08-03_v1.yaml' || chr(10) || 
        '- combinado_gestante_gemelar_2026-08-03_v1.yaml'
    ) RETURNING id INTO v_round_id;

    -- Item 1: Prioridades no Bloco 2
    INSERT INTO public.changelog_items (
        round_id,
        descricao_legivel,
        classificacao,
        camada,
        descricao_tecnica,
        sort_order
    ) VALUES (
        v_round_id,
        '#3 — Prioridades não aparecem mais na Integração Fisiopatológica' || chr(10) || 'As prioridades clínicas (🔴 Alta / 🟠 Moderada / 🟡 Investigativa) agora aparecem exclusivamente na Síntese Clínica. A Integração Fisiopatológica voltou a trazer apenas a correlação e a interpretação dos mecanismos, sem duplicar a priorização. Aplicado nos perfis masculino e feminino.',
        'suporte',
        'dify',
        'Origem: instrução "Sinalize a prioridade de cada eixo..." dentro do bullet "Eixos fisiopatológicos do caso". Ação: frase removida (3 pontos por perfil). Validação: 74/74 (masc) e 73/72 (fem).',
        1
    ) RETURNING id INTO v_item1_id;

    IF v_report_id IS NOT NULL THEN
        INSERT INTO public.changelog_item_reports (item_id, request_id)
        VALUES (v_item1_id, v_report_id);
    END IF;

    -- Item 2: Roteamento PDF/imagem
    INSERT INTO public.changelog_items (
        round_id,
        descricao_legivel,
        classificacao,
        camada,
        descricao_tecnica,
        sort_order
    ) VALUES (
        v_round_id,
        'Leitura de imagens nos exames voltou a funcionar' || chr(10) || 'Fotos e prints enviados no chat estavam sendo recusados com erro de formato em algumas funcionalidades. Agora imagens são lidas normalmente em Exame, Casos Clínicos, Composição Corporal e Genética, em todos os perfis.',
        'suporte',
        'dify',
        'Origem: nó "PDF ou Imagem?" com sub-condição "type is document" removida. Ação: 16 pontos de edição (4 nós x 4 perfis). Validação: contagens inalteradas.',
        2
    ) RETURNING id INTO v_item2_id;

END $$;