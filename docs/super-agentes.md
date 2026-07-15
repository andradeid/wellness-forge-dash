# Super Agentes — Arquitetura, Roteamento e Armadilhas

> Documento escrito a partir da **leitura do código** (não de memória).
> Cada afirmação está marcada como **[V]** verificado no repo (com o arquivo/linha ou migration onde mora), ou **[R]** reportado pelo usuário/validado em runtime nesta thread mas não amarrado a uma linha do repo.
>
> Se você for mexer em qualquer coisa que este doc descreve, **releia o código apontado**. Este arquivo existe pra evitar deduções erradas — não para substituir a fonte.

---

## 1. Arquitetura

**[R] 4 super agentes, 7 tarefas cada.** Os `agent_id` são `super_masculino`, `super_feminino`, `super_gestante_mono`, `super_gestante_gemelar` (**[V]** `src/hooks/useAgentConfig.ts:163-169`). A contagem 4×7 e os seeds vivem em dados do banco (tabelas `dify_agents`, `super_agent_tasks`, `super_agent_cards`) — não em migration SQL. **Se precisar da lista canônica de tasks, consulte o banco, não este doc.**

**[V] Roteamento interno é feito pelo Dify via `selected_task`.** O app não instancia workflows diferentes por tarefa: envia UM `agent_id` (uma API key) mais o campo `selected_task` no payload de inputs, e o app Dify roteia internamente para a esteira certa (`src/routes/api/dify.chat.tsx:82-103`).

**[V] Fallback silencioso é o modo de falha crítico:** se o `task_key` do Lovable não bater exatamente com o case esperado pelo roteador do Dify, o Dify cai no default (tipicamente raciocínio) **sem erro HTTP, sem log** — só resposta clinicamente errada. `task_key` é contrato case-sensitive entre `super_agent_tasks.task_key` (Supabase) e o switch interno do workflow no Dify.

---

## 2. O caminho do card "Análise Completa"

Todos os arquivos abaixo verificados **[V]**:

```
Clique no card na home
  └─ src/routes/app.fale-com-lumma.tsx:836   (card.card_trigger === 'analise_completa')
      └─ resolveAnaliseCompleta(profile, pregnancy_type)
          └─ src/hooks/useAgentConfig.ts:158-180
              ├─ profile → targetAgent  (adulto_masculino → super_masculino, ...)
              ├─ gestante sem pregnancy_type → return null   (BLOQUEIA)
              ├─ profile desconhecido       → return null   (BLOQUEIA)
              └─ acha o card em `super_agent_cards`
                     WHERE card_trigger='analise_completa' AND task.agent_id=targetAgent
                 devolve { agentId, taskKey }
  └─ Navega para /app/chat/:patientId?module=analise_completa&agent=<id>&task=<taskKey>
      └─ src/routes/app.chat.$patientId.tsx grava agent_type e selected_task em patient_chats
          └─ useDifyChat envia payload:
                inputs = { patient_name, patient_age, patient_sex,
                           patient_profile, gestante_tipo, gestante_periodo,
                           fase_ciclo, selected_task, ... }
                (src/routes/api/dify.chat.tsx:87-105)
```

O card `exames_de_sangue` (agentes não-super) segue o mesmo padrão com `getAgentForCard` no lugar de `resolveAnaliseCompleta` (**[V]** `useAgentConfig.ts:78-110`; call sites em `app.fale-com-lumma.tsx:761`, `QuickAnalysisDialog.tsx:532`).

---

## 3. Onde cada coisa mora — e **por quê**

### `super_agent_cards`
- **[V]** Carrega o `card_trigger` **E** o vínculo agente↔task (via `task_id` → `super_agent_tasks.agent_id + task_key`). Verificado em `useAgentConfig.ts:52-56, 158-180`.
- **É a fonte do `task_key`**. Sem essas linhas o roteador do card não sabe qual `selected_task` mandar pro Dify.

### `dify_agents.card_trigger` dos 4 super agentes = **NULL de propósito**
- **[V]** Migration `20260711234501` cria o trigger `validate_card_trigger_uniqueness` (linhas 84-123) que é **cross-table**: um mesmo `card_trigger` **não pode existir simultaneamente em `dify_agents` e `super_agent_cards`**. Insert em qualquer uma checa a outra e levanta `unique_violation`.
- **Consequência prática:** se alguém colocar `card_trigger='analise_completa'` numa linha de `dify_agents`, o trigger obriga a apagar as linhas correspondentes de `super_agent_cards`. Apagou → perdeu o vínculo `task_id`/`task_key` → o card deixa de saber qual tarefa mandar pro Dify → fallback silencioso (seção 1).
- **[V]** Migration `20260715172540` explicita isso no comentário: "A unicidade cross-table permanece garantida pelo trigger validate_card_trigger_uniqueness."
- **[V]** A mesma migration removeu o índice único **por dentro** de `super_agent_cards` (`idx_super_agent_cards_trigger_unique`) trocando por um índice não-único. Isso é o que permite os **4 cards** de Análise Completa compartilharem `card_trigger='analise_completa'` — um por super agente.

**Regra:** `card_trigger` de super agente mora **exclusivamente** em `super_agent_cards`. Nunca em `dify_agents`. Isso não é lixo, é o desenho.

### `super_agent_tasks`
- **[V]** Guarda `agent_id + task_key + label + icon + sort_order` (`useAgentConfig.ts:48-51`). É de onde o `selected_task` sai.

---

## 4. Créditos — fluxo e armadilha

**Fluxo completo [V]:**

```
task_key (super_agent_tasks.task_key)
  └─ resolveAgentKey({ isSuperAgent: true, selectedTask })   src/lib/agent-key-map.ts:74-86
      └─ MAP_TASK[selectedTask]                              agent-key-map.ts:54-72
          └─ agent_key (ex.: "exames_laboratoriais")
              └─ consume_credits(user_id, agent_key, preview)
                  └─ supabase/migrations/20260623215948... :26-81
                      └─ SELECT cost_credits FROM agent_costs WHERE agent_key=? AND is_active=true
```

**Armadilha — passa DE GRAÇA e em silêncio [V]:**

`consume_credits` (migration `20260623215948`, linhas 42-44):

```sql
IF v_cost IS NULL OR v_cost = 0 THEN
  RETURN TRUE;
END IF;
```

Isso significa que qualquer uma das condições abaixo faz o débito ser **ignorado silenciosamente** (sem erro, sem log em `credit_transactions`):

1. `task_key` não existe em `MAP_TASK` (`agent-key-map.ts:54-72`) → `resolveAgentKey` devolve `null` → nenhum `consume_credits` é chamado.
2. `task_key` existe em `MAP_TASK` **mas** o `agent_key` resultante não tem linha em `agent_costs`, ou tem `is_active=false`, ou `cost_credits=0` → `v_cost IS NULL OR 0` → `RETURN TRUE`.

**Foi assim que 4 chaves de exame ficaram sem debitar** (relato do usuário; a mecânica está verificada). Ao adicionar um `task_key` novo: **sempre** adicione a entrada em `MAP_TASK` **e** confira `agent_costs` tem a linha ativa com custo > 0.

---

## 5. Bloqueios (por que são bloqueios, não fallbacks)

**[V]** `resolveAnaliseCompleta` (`useAgentConfig.ts:158-180`):
- `patientProfile` indefinido / não reconhecido → `return null`.
- `patientProfile === 'gestante'` sem `pregnancy_type` (`single`/`multiple`) → `return null`.

**[V]** `getAgentForCard` para `exames_de_sangue` (`useAgentConfig.ts:83-107`):
- Perfil desconhecido → `return null`. Comentário no próprio código: "SEGURANÇA CLÍNICA: NUNCA caímos em fallback silencioso para o agente masculino. (…) evita receitar ativos teratogênicos a gestantes".

**Por quê bloqueio e não fallback:** rotear paciente-perfil-desconhecido para um agente arbitrário produz recomendação clínica plausível mas errada — pior que erro visível. O call site precisa **exigir** que o usuário complete o cadastro antes de abrir o chat pelo card.

---

## 6. Entry points do chat — quais travam perfil e quais não

Mapeamento verificado em busca no repo. Só os 2 entry points por-card fazem roteamento por perfil e fixação de agente:

| Caminho | Arquivo | Trava perfil na entrada? |
|---|---|---|
| Card "Análise Completa" na home | `src/routes/app.fale-com-lumma.tsx:836-870` | **Sim** — via `resolveAnaliseCompleta`, `null` bloqueia |
| Card "Exames de Sangue" na home | `src/routes/app.fale-com-lumma.tsx:761` | **Sim** — via `getAgentForCard`, `null` bloqueia |
| QuickAnalysisDialog | `src/components/QuickAnalysisDialog.tsx:530-544` | **Sim quando `moduleContext === 'exames_de_sangue'`** |
| Lista de pacientes → "Chat" | `src/routes/app.patients.tsx` | Não — `<Link>` direto |
| Dashboard → link paciente | `src/routes/app.dashboard.tsx` | Não |
| Retomar chat (histórico) | `src/components/chat/PatientChatHistory.tsx` | Não — usa `chatId` existente |
| Lista de chats → paciente | `src/routes/app.chats.tsx` | Não |
| Evolução → link chat | `src/routes/app.evolution.$patientId.tsx` | Não |
| Admin feedbacks | `src/routes/app.admin.feedbacks.tsx` | Não |

**Consequência de desenho:** os filtros de perfil dentro do chat (`publico`, `sexo`, `gestanteTipo`) precisam continuar editáveis nos caminhos "Não" — é a única forma do usuário informar o perfil quando entrou por lista/dashboard. Travar sempre quebra fluxo real. Travar só quando o chat foi aberto por card com perfil fixado depende de um flag de origem gravado em `patient_chats` (**a coluna necessária ainda não existe** — se for implementar, esse é o pré-requisito).

---

## 7. Fronteira com o Dify — o que o app **não** controla

**[V]** O payload enviado ao Dify está em `src/routes/api/dify.chat.tsx:87-105`. Todo o comportamento clínico dos workflows — faixas de referência, condutas, textos — mora **nos prompts dos workflows no Dify**, não neste repo.

**[R]** Sobre o consumo de variáveis pelos prompts (comportamento observado no Dify, não verificável neste repo):
- Os prompts dos workflows de Análise Completa leem apenas: `patient_name`, `patient_age`, e — conforme o super agente — `fase_ciclo` (feminino) ou `gestante_periodo` (gestantes).
- Os prompts **não** leem `patient_profile` nem `patient_sex`. A seleção do perfil é feita **pela escolha de qual super agente/task recebe a chamada**, não pelo conteúdo dessas variáveis.

**Consequência prática:** mudar `patient_profile` no payload não muda o comportamento do super agente. Quem muda o comportamento é o par `(agent_id, selected_task)`. Se a divergência entre o `agent_type` gravado no chat e os filtros editados na UI importa, ela importa porque **outra parte** do app (contexto injetado, logs, exibição) usa `patient_profile` — não porque o Dify se adapta.

---

## 8. Armadilhas — o que NÃO fazer

- **Não** coloque `card_trigger` de super agente em `dify_agents`. O trigger cross-table força a remoção das linhas de `super_agent_cards` e você perde o `task_key`.
- **Não** apague linhas de `super_agent_cards` achando que estão órfãs. "Sem `agent_id` direto" ≠ órfão — o vínculo agente↔task passa por `task_id` → `super_agent_tasks`.
- **`task_key` é case-sensitive e tem que ser idêntico ao switch no Dify.** Não bateu → cai no default (raciocínio) **silenciosamente**. Sem erro HTTP. Sem log. Só resposta errada.
- **Não** replique lógica de "raciocínio/fallback" dentro dos workflows de exame no Dify. A recusa de conteúdo que não é laudo é feature (trava clínica), não bug.
- **`resolveCardToTask` (`useAgentConfig.ts:137-143`) está morto** e perdeu o índice único que o protegia (migration `20260715172540`). Se alguém ressuscitar essa função, `cards.find(c => c.card_trigger === X)` vai pegar uma **linha arbitrária** entre as 4 que compartilham o trigger — comportamento indefinido. Delete a função ou reescreva-a para receber também o perfil antes de usar.
- **Ao adicionar `task_key` novo:** MAP_TASK (`src/lib/agent-key-map.ts:54-72`) + `agent_costs` (linha ativa, custo > 0), senão o débito passa de graça e em silêncio (seção 4).

---

## 9. Índice de arquivos-chave

- `src/hooks/useAgentConfig.ts` — carga de agentes/tasks/cards, `resolveAnaliseCompleta`, `getAgentForCard`.
- `src/routes/app.fale-com-lumma.tsx` — home; dedupe de cards por `card_trigger` e roteamento no clique.
- `src/routes/app.chat.$patientId.tsx` — abre chat, grava `agent_type` e `selected_task` em `patient_chats`.
- `src/hooks/useDifyChat.ts` — envia `selected_task` a cada mensagem; rehidrata a partir de `patient_chats.selected_task`.
- `src/routes/api/dify.chat.tsx` — proxy; injeta `selected_task` nos `inputs`.
- `src/lib/agent-key-map.ts` — `MAP` (agent_id → agent_key) e `MAP_TASK` (task_key → agent_key) para créditos.
- `src/lib/credits.functions.ts` — server functions `getAgentCost`, `consumeCredits`.
- `supabase/migrations/20260711234501_*.sql` — cria `super_agent_tasks`, `super_agent_cards`, trigger cross-table.
- `supabase/migrations/20260715172540_*.sql` — troca índice único por não-único em `super_agent_cards.card_trigger` (permite 4 cards para `analise_completa`).
- `supabase/migrations/20260623215948_*.sql` — `consume_credits` (linhas 42-44: bypass silencioso quando `v_cost IS NULL`).
