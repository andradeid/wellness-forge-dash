CREATE TABLE public.baseline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  funcionalidade text NOT NULL,
  existia text NOT NULL CHECK (existia IN ('sim','nao','parcial')),
  camada text NOT NULL CHECK (camada IN ('dify','lovable','banco')),
  comportamento_tecnico text,
  legivel text NOT NULL,
  situacao_legivel text NOT NULL CHECK (situacao_legivel IN ('ja_fazia','nao_fazia','em_parte')),
  baseline_version text NOT NULL DEFAULT '1.0',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (baseline_version, area, funcionalidade)
);

GRANT SELECT ON public.baseline_items TO authenticated;
GRANT ALL ON public.baseline_items TO service_role;

ALTER TABLE public.baseline_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Curadores e super admins leem a baseline"
ON public.baseline_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'curator'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

INSERT INTO public.baseline_items (area, funcionalidade, existia, camada, comportamento_tecnico, legivel, situacao_legivel, sort_order) VALUES
('Exame de Sangue','Painel de marcadores (JSON)','sim','dify','Emitia bloco JSON {markers} com valor/referência/status','Mostrar o painel de marcadores (valores, referências, cores de status)','ja_fazia',0),
('Exame de Sangue','Faixas funcionais','sim','dify','Usava faixas funcionais IAPP','Usar faixas funcionais (não só laboratoriais)','ja_fazia',1),
('Exame de Sangue','Relações clínicas (TG/HDL etc.)','sim','dify','Calculava e exibia relações clínicas','Mostrar relações clínicas (ex.: triglicerídeos/HDL)','ja_fazia',2),
('Exame de Sangue','Integração fisiopatológica','sim','dify','Bloco 2 — integração dos eixos','Integrar os achados (visão dos eixos)','ja_fazia',3),
('Exame de Sangue','Síntese clínica','sim','dify','Bloco 3 — síntese priorizada','Fazer a síntese clínica priorizada','ja_fazia',4),
('Exame de Sangue','Conduta nutricional','sim','dify','Bloco 4 — objetivos/estratégias/estilo de vida/suplementação','Sugerir conduta nutricional','ja_fazia',5),
('Exame de Sangue','Gerava formulação dentro do exame','sim','dify','Bloco 5 — o exame já formulava (separado depois por pedido da curadoria)','Gerar formulações junto da análise do exame','ja_fazia',6),
('Exame de Sangue','Emitia marcador FORMULACOES_SUGERIDAS no exame','sim','dify','O marcador saía do Bloco 5 do exame','Emitir o marcador de formulações a partir do exame','ja_fazia',7),
('Exame de Sangue','Painel aparece no início do stream','nao','lovable','Na entrega só renderizava no message_end — antecipação foi ajuste posterior','Mostrar o painel logo no começo da resposta (antes do texto)','nao_fazia',8),
('Formulações e Receita','Gerava formulações magistrais','sim','dify','prod_node gerava formulações','Gerar formulações magistrais','ja_fazia',9),
('Formulações e Receita','Receituário para farmácia','sim','dify','PASSO 4 — Manipular X cápsulas, dados do nutricionista','Gerar o receituário para a farmácia','ja_fazia',10),
('Formulações e Receita','Separação fito/suplemento','sim','dify','Categorias regulatórias separadas','Separar suplementos de fitoterápicos','ja_fazia',11),
('Formulações e Receita','Cálculo individualizado de Vitamina D nas formulações','nao','dify','A regra determinística NÃO estava no nó de produção na entrega','Calcular a dose individualizada de Vitamina D nas formulações','nao_fazia',12),
('Formulações e Receita','Leitura do banco IAPP (KB)','sim','dify','Consultava a KB de formulações — origem do tema banco vs personalização','Usar o banco de formulações IAPP como base','ja_fazia',13),
('Formulações e Receita','Oferta ''Gerar Formulações'' nas análises','nao','dify','Não oferecia o botão ao fim das análises (adicionado depois)','Oferecer o botão ''Gerar Formulações'' ao fim das análises','nao_fazia',14),
('Raciocínio Clínico','Regra de Vitamina D no raciocínio','sim','dify','A regra de Vit D existia no raciocínio clínico','Aplicar a regra de Vitamina D','ja_fazia',15),
('Raciocínio Clínico','Antropometria automática (seleção de protocolo)','nao','dify','Não selecionava protocolo (Jackson/Pollock/Durnin) automaticamente','Selecionar sozinho o protocolo de dobras cutâneas','nao_fazia',16),
('Composição Corporal','Análise de bioimpedância','sim','dify','Analisava bioimpedância','Analisar bioimpedância','ja_fazia',17),
('Composição Corporal','Análise por foto (JSON body_assessment)','sim','dify','Emitia JSON body_assessment estruturado','Analisar composição corporal por foto','ja_fazia',18),
('Composição Corporal','Template antropométrico na foto (RCA/RCQ)','parcial','dify','Feminino JÁ tinha; masculino e gestantes NÃO tinham','Modelo detalhado com circunferências (cintura/quadril, RCA/RCQ)','em_parte',19),
('Composição Corporal','Etiqueta de confiança (foto)','sim','lovable','Renderizada por confidenceBadge — curadoria pediu retirar','Mostrar a etiqueta ''confiança alta/média/baixa'' na foto','ja_fazia',20),
('Refeição por Foto','Estimativa de refeição','sim','dify','Emitia JSON foods com macros','Estimar calorias e macronutrientes da refeição','ja_fazia',21),
('Refeição por Foto','Etiqueta de confiança (refeição)','sim','lovable','Mesma confidenceBadge — curadoria pediu retirar','Mostrar a etiqueta ''confiança'' por alimento','ja_fazia',22),
('Particularidades por Perfil','Feminino: faixas por fase do ciclo','sim','dify','Folicular/lútea + eixo hormonal (estradiol/FSH)','Feminino: faixas por fase do ciclo e eixo hormonal','ja_fazia',23),
('Particularidades por Perfil','Gestantes: faixas por trimestre','sim','dify','Faixas ajustadas ao trimestre','Gestantes: faixas por trimestre','ja_fazia',24),
('Particularidades por Perfil','Gestantes: hiperlipidemia fisiológica','sim','dify','Tratava lipídios altos como fisiológicos','Gestantes: colesterol/triglicerídeos altos como fisiológicos','ja_fazia',25),
('Particularidades por Perfil','Gestantes: segurança gestacional','sim','dify','Contraindicados bloqueados + fito só gengibre JÁ na entrega','Gestantes: segurança gestacional (bloquear contraindicados, fito só gengibre)','ja_fazia',26),
('Particularidades por Perfil','Gestantes: trava foto (não sugerir perda de peso)','nao','dify','Não existia; criada depois','Gestantes: evitar sugerir perda de peso na foto','nao_fazia',27),
('Particularidades por Perfil','Gemelar: contexto múltiplos fetos','sim','dify','Demandas aumentadas JÁ na entrega','Gemelar: considerar demandas maiores de múltiplos fetos','ja_fazia',28),
('Pesquisa Científica','Busca científica (PubMed) e web','sim','dify','Chat Agent ReAct, Gemini, PubMed + Tavily','Buscar artigos científicos (PubMed) e na web','ja_fazia',29),
('Pesquisa Científica','DOI do artigo','nao','dify','Trazia link, não o DOI — pedido de curadoria','Trazer o DOI do artigo (não só o link)','nao_fazia',30),
('Pesquisa Científica','Resumo por upload','nao','dify','Só por link/DOI, não por upload — pedido de curadoria','Resumir um artigo enviado por upload','nao_fazia',31),
('Experiência no App','Seleção de agente por perfil','sim','lovable','getAgentForCard / resolveAnaliseCompleta','Selecionar o agente certo pelo perfil do paciente','ja_fazia',32),
('Experiência no App','Bloqueio anti-fallback (segurança gestante)','sim','lovable','Perfil desconhecido bloqueia; nunca cai no masculino','Proteger gestantes (nunca cair no agente masculino por engano)','ja_fazia',33),
('Experiência no App','Troca de agente na conversa','sim','lovable','Reset de conversation_id ao trocar','Trocar de agente dentro da conversa','ja_fazia',34),
('Experiência no App','Confirmação de perfil gestacional','sim','lovable','GestationalConfirmationPopup / PregnancyQuestionnaire','Confirmar o tipo de gestação (única/gemelar)','ja_fazia',35),
('Experiência no App','Feedback curti/não curti/sugestão','sim','lovable','MessageFeedback → tabela ai_feedback','Dar feedback (curti / não curti / sugestão)','ja_fazia',36),
('Experiência no App','Anexar imagem ao feedback','nao','lovable','Não existia — é do novo sistema de curador','Anexar imagem ao feedback','nao_fazia',37),
('Experiência no App','Seleção de tarefa na nova conversa','nao','lovable','Ia direto para Exame — pedido de curadoria','Escolher a tarefa ao abrir nova conversa','nao_fazia',38),
('Experiência no App','Gestão de assinaturas e créditos','sim','lovable','Integração Stripe de planos e créditos','Gerenciar assinaturas e créditos','ja_fazia',39),
('Geral','Modelo dos exames','sim','dify','Todos os nós em gpt-5.2 na entrega — Gemini foi melhoria posterior','Modelo de análise dos exames (era mais lento na entrega)','ja_fazia',40),
('Geral','Memória de sessão','sim','dify','Contexto cumulativo (janela ~30)','Lembrar do contexto ao longo da conversa','ja_fazia',41);