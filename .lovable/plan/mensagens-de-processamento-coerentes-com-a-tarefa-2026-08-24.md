# Mensagens de processamento coerentes com a tarefa

Hoje, ao fazer uma pergunta clínica, aparece "Lendo o exame com atenção…" — texto de exame laboratorial. Causa confirmada no código:

1. Em `/app/general/$chatId` (Perguntas Clínicas), o `ChatMessageList` recebe apenas `agentType` e **não** recebe `taskType`. Sem tarefa, `ChatThinking` cai na regra `key.startsWith("super") → EXAM_STEPS`.
2. Mesmo com tarefa, faltam textos para as tarefas novas (`bioimpedancia`, `calorimetria`, `genetica`, `microbioma`), que também caem em exame ou no genérico.

## O que será ajustado

**1. Passar a tarefa selecionada no chat geral**
- `src/routes/app.general.$chatId.tsx`: enviar `taskType={selectedTaskKey}` ao `ChatMessageList` (igual ao chat de paciente).

**2. Corrigir o fallback do super agente**
- `src/components/chat/ChatThinking.tsx`: `super*` sem tarefa deixa de significar "exame" e passa a usar textos neutros de raciocínio clínico ("Organizando o raciocínio clínico…"), reservando os textos de exame para as tarefas `exam*`.

**3. Novos conjuntos de textos por tarefa**
- `bioimpedancia` — leitura de bioimpedância, massa magra/gordura, hidratação, ângulo de fase.
- `calorimetria` — gasto energético, taxa metabólica basal, quociente respiratório.
- `genetica` — reaproveita os textos de nutrigenômica já existentes (`GENETICS_STEPS`).
- `microbioma` — diversidade bacteriana, disbiose, eixo intestino-cérebro.

**4. Revisão dos textos existentes**
Conferir que cada tarefa visível na UI (`exam_masc`, `exam_fem`, `exam_gest_mono`, `exam_gest_gem`, `estimativa_refeicao_foto`, `composicao_corporal_foto`, `reasoning`, `production`) tem um conjunto próprio e coerente com o que a nutricionista pediu.

## Escopo

Somente UI/textos. Nenhuma mudança em agentes Dify, banco, custos ou roteamento de tarefas.
