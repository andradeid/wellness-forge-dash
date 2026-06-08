# Arquitetura LUMMA 2.0 - Documentação Técnica

Este documento descreve a arquitetura do sistema LUMMA 2.0, detalhando a integração entre frontend, proxy, banco de dados e a orquestração de agentes via Dify.

---

## 1. VISÃO GERAL DA ARQUITETURA

### Stack Técnica
- **Frontend:** React (Vite) + TanStack Start (SSR/API Routes) + Tailwind CSS + Shadcn UI.
- **Backend/Database:** Supabase (PostgreSQL + Auth + Storage).
- **IA Engine:** Dify VPS (Orquestrador de fluxos e agentes).
- **Modelos de IA:** GPT-4o, Gemini 2.0 Flash, Claude 3.5 Sonnet (configurados via Dify).
- **Infraestrutura:** Lovable Cloud (Hospedagem Frontend/API Proxy).

### Fluxo Geral de Interação
1. **Identificação:** O nutricionista acessa o sistema e seleciona/cadastra um paciente.
2. **Entrada de Dados:** O usuário envia uma mensagem de texto ou faz upload de um exame (PDF/Imagem).
3. **Encaminhamento (Proxy):** O frontend envia a requisição para `/api/dify/chat`. O proxy autentica o usuário, recupera a API Key correta do agente e repassa a chamada ao Dify.
4. **Processamento (Dify):** O Dify recebe a consulta, executa o fluxo (Workflow) ou agente (Chat Agent), consulta a Base de Conhecimento (KB) e retorna uma resposta via Stream (SSE).
5. **Renderização:** O frontend processa os chunks do stream, renderiza o texto em Markdown e, se houver dados estruturados (JSON), exibe o `ExamResultCard`.

### Diagrama Textual
```text
[Frontend (React)] 
      ↓ (fetch /api/dify/chat)
[Proxy (TanStack Start API Route)] 
      ↓ (API Key + BaseURL)
[Dify VPS] 
      ↓ (Workflow / Agent)
[Knowledge Base (KB)] + [LLM Model]
      ↓ (SSE Stream)
[Frontend (SSE Buffer Processing)]
```

---

## 2. CATÁLOGO DE AGENTES

| Nome | Agent ID | Card Trigger | Modelo | Tipo Dify | Observações |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Exame Masculino** | `exam_masculino` | `exames_de_sangue` | GPT-4o / Claude | Workflow | Fallback padrão para exames. |
| **Exame Feminino** | `exam_feminino` | `exames_de_sangue` | GPT-4o / Claude | Workflow | Foco em referências hormonais femininas. |
| **Gestante Mono** | `exam_gestante_mono`| `exames_de_sangue` | GPT-4o | Workflow | Referências para gestação monofetal. |
| **Gestante Gem** | `exam_gestante_gem` | `exames_de_sangue` | GPT-4o | Workflow | Referências para gestação gemelar. |
| **Produção** | `production` | (Vários) | GPT-4o | Workflow | Criação de dietas e suplementos. |
| **Raciocínio** | `reasoning` | `raciocinio_clinico`| GPT-4o | Workflow | Análise profunda de casos. |
| **Research** | `research` | `artigos_cientificos`| Gemini 2.0 Flash | Agent Chat | Uso de ferramentas (ReAct). |
| **Genetics** | `genetics` | `exame_genetico` | Claude 3.5 | Workflow | Interpretação de polimorfismos. |

### Detalhes Técnicos (O que NÃO mudar)
- **Eventos SSE:** O sistema espera `message`, `agent_message`, `text_chunk` e `message_end`. Não altere os nomes dos eventos no Dify.
- **JSON Estruturado:** Os agentes de exame DEVEM retornar um bloco ` ```json { "markers": [...] } ``` ` para renderizar cards.
- **Inputs:** O Dify espera variáveis como `patient_name`, `patient_profile`, `gestante_tipo`, etc. Se mudar no Dify, quebra no frontend.

---

## 3. FLUXO DE DADOS DO PACIENTE

### Cadastro e Perfil
O paciente é cadastrado na tabela `patients`. O campo `patient_profile` (derivado de `gender`, `is_pregnant` e `birth_date`) é crucial para a lógica de seleção de agentes.

### Lógica de Seleção (`getAgentForCard`)
Localizada em `src/hooks/useAgentConfig.ts`:
- Se o card for `exames_de_sangue`:
  - Perfil `adulto_masculino` → `exam_masculino`.
  - Perfil `adulto_feminino` → `exam_feminino`.
  - Perfil `gestante` + tipo `gemelar` → `exam_gestante_gem`.
  - Perfil `gestante` + tipo `monofetal` → `exam_gestante_mono`.

### Contexto e Persistência
- **Contexto de Exames:** Ao enviar exames, os metadados são salvos em `patient_exams`.
- **Conversation ID:** O `dify_conversation_id` é armazenado em `patient_chats` (ou `general_chats`).
- **Reset na Troca:** Ao trocar de agente dentro de um mesmo chat, o `conversation_id` deve ser enviado como `null` ou omitido para iniciar um novo contexto no Dify compatível com o novo agente.

---

## 4. TABELAS DO BANCO DE DADOS

- **`dify_agents`**: Configuração central. Armazena `agent_id`, `api_key`, `endpoint` e `card_trigger`.
- **`patient_chats`**: Cabeçalho da conversa vinculada a um paciente. Armazena o `dify_conversation_id`.
- **`chat_messages`**: Histórico completo de mensagens (role, content, agent_type).
- **`patient_exam_results`**: Marcadores extraídos e indexados (Glicose, Vitamina D, etc) para geração de gráficos futuros.
- **`patients`**: Dados demográficos e clínicos básicos do paciente.

---

## 5. PROXY /api/dify/chat

### Funcionamento
O proxy atua como um intermediário seguro entre o cliente (navegador) e o Dify.
1. Recebe o `token` JWT do Supabase via header.
2. Valida o usuário e extrai o `userId`.
3. Busca a `api_key` do agente na tabela `dify_agents` (usando cache para performance).
4. Monta o payload do Dify, incluindo inputs automáticos do nutricionista/paciente.
5. Inicia a chamada ao Dify com `response_mode: "streaming"`.
6. Repassa o stream SSE bruto para o frontend.

### Regras de Ouro (NÃO ALTERAR)
- **Segurança:** Nunca exponha as chaves do Dify no frontend.
- **Timeout:** Configurado em 120s para suportar respostas longas.
- **Charset:** Deve retornar `utf-8` para evitar erros de acentuação no stream.

---

## 6. AGENTE RESEARCH — DETALHAMENTO

O agente Research é único no sistema por ser um **Chat Agent** (ReAct) em vez de um Workflow estático.

- **Modelo:** Gemini 2.0 Flash (pela alta janela de contexto e velocidade de ferramentas).
- **Ferramentas:** `PubMed` (busca científica) e `Tavily` (busca web geral).
- **Ciclo ReAct:** O agente "Pensa" (`Thought`), decide uma "Ação" (`Action`), recebe a "Observação" e repete até a resposta final.
- **Interface:** O frontend filtra os pensamentos internos (Thought/Action) via `cleanResearchOutput` para exibir apenas o progresso e a resposta final ao nutricionista.
- **Cards:** Este agente **não renderiza cards de exames**.
- **Persistência:** O histórico é salvo por um mecanismo de "debounce" no frontend (`researchTimeoutRef`) para garantir que respostas longas e lentas não sejam perdidas se o stream cair.

---

## 7. REGRAS DE MANUTENÇÃO

### O que é Seguro Alterar
- Adicionar novos agentes na tabela `dify_agents`.
- Alterar o `label` ou `description` de agentes existentes.
- Atualizar Bases de Conhecimento no Dify.

### O que Requer Testes
- Alterar o modelo de IA no Dify (pode mudar o formato do JSON de saída).
- Mudar a lógica de `getAgentForCard` no frontend.

### NUNCA Alterar (Sem consulta técnica)
- O nome das variáveis de input no Dify (`patient_id`, `patient_sex`, etc).
- A estrutura do `JSON markers` gerado pelos agentes de exame.
- A lógica de buffer SSE no `useDifyChat.ts`.

---

## 8. TROUBLESHOOTING

- **"Unterminated string in JSON"**: Chunk parcial do stream tentou ser parseado antes de completar. Corrigido com buffer acumulador no `useDifyChat.ts`.
- **Agente pensando infinitamente**: Verifique se o Dify retornou um erro 500 no console de rede (aba Network). Geralmente é erro na API Key ou no modelo.
- **Cards não aparecem**: Verifique se o agente enviou o JSON no formato correto e dentro de blocos de código (fenced code blocks).
- **Cota Gemini (429)**: O Research pode falhar se o limite de requisições por minuto (RPM) do Gemini for atingido. Recomendado usar Tier pago da Google AI Studio.

---
*Documento gerado em 08/06/2026 para a equipe IAPP.*
