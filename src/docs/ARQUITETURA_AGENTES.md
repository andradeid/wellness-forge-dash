# Arquitetura de Agentes e Gestão de Contexto

Este documento descreve o funcionamento do ecossistema de múltiplos agentes da Lumma, detalhando como os dados fluem do banco de dados até a inteligência artificial e como o contexto é mantido entre diferentes módulos.

## 1. Visão Geral

O sistema utiliza uma arquitetura em camadas para garantir segurança e flexibilidade:

1.  **Frontend (React/Vite)**: Gerencia o estado da conversa, seleção de pacientes e orquestração dos tipos de agentes através do hook `useDifyChat`.
2.  **Edge Function (Supabase/Deno)**: Atua como um proxy seguro entre o frontend e o Dify, injetando chaves de API e tratando o streaming de dados.
3.  **Dify (Orquestrador de IA)**: Plataforma onde residem os agentes (LLMs) com suas instruções específicas, ferramentas e bases de conhecimento.

## 2. Agentes Disponíveis

| agent_id | Nome | Descrição | Precisa de Paciente? |
| :--- | :--- | :--- | :--- |
| `exam` | Exames de Sangue | Análise técnica de marcadores laboratoriais e detecção de padrões. | Sim |
| `metabolism` | Composição e Metab. | Análise de bioimpedância, gasto energético e antropometria. | Sim |
| `genetics` | Genética e Microbioma | Interpretação de testes nutrigenéticos e saúde intestinal. | Sim |
| `reasoning` | Casos Clínicos | Diagnóstico diferencial, correlação de sintomas e raciocínio clínico. | Sim |
| `production` | Plano & Receitas | Elaboração de planos alimentares, receitas e prescrições. | Sim |
| `research` | Pesquisa Científica | Busca em base de dados científica e evidências clínicas. | Opcional |

## 3. Fluxo de uma Conversa Nova

1.  **Seleção**: O nutricionista seleciona um paciente e escolhe um módulo (ex: "Exames").
2.  **Preparação**: O `useEffect` em `app.chat.$patientId.tsx` carrega os dados do paciente do Supabase.
3.  **Auto-população**: Os filtros de perfil (sexo, gestação, trimestre) são calculados e salvos no `metaRef`.
4.  **Envio**: Ao enviar uma mensagem, o `useDifyChat` monta a `finalQuery` injetando o prefixo de contexto adequado.
5.  **Processamento**: A Edge Function repassa a query e o objeto `meta` para o Dify.
6.  **Resposta**: O Dify processa a resposta via stream, que é exibida em tempo real e salva no banco ao final.

## 4. Dados do Paciente

Os dados são extraídos automaticamente da tabela `patients` e transformados para o formato que o Dify espera:

### Campos Enviados (Objeto Meta)
- `patient_name`: Nome completo.
- `patient_sex`: masculino ou feminino.
- `patient_profile`: `gestante`, `adulto_feminino` ou `adulto_masculino`.
- `gestante_tipo`: `Monofetal` ou `Gemelar`.
- `gestante_periodo`: `1º Trimestre`, `2º Trimestre` ou `3º Trimestre`.

### Lógica de Cálculo Automático
- **Perfil**: Se `is_pregnant` for true, o perfil é `gestante`. Caso contrário, baseia-se no sexo.
- **Trimestre**: Calculado a partir de `gestational_weeks`:
  - `<= 12 semanas`: 1º Trimestre.
  - `13 a 27 semanas`: 2º Trimestre.
  - `>= 28 semanas`: 3º Trimestre.

## 5. Troca de Agente no Meio da Conversa

Quando o usuário troca de módulo (ex: de *Exames* para *Plano Alimentar*), o sistema realiza uma "troca de contexto quente":

-   **O que é preservado**: O `metaRef` (dados do perfil do paciente) e o `examContext` (dados extraídos do último exame analisado nesta sessão).
-   **O que é resetado**: O `conversation_id` do Dify. Isso força o Dify a iniciar uma nova conversa técnica com o novo agente, garantindo que as instruções do novo módulo sejam seguidas estritamente.
-   **Injeção de Contexto**: A primeira mensagem enviada ao novo agente conterá todo o histórico clínico relevante (perfil + resultados de exames) no prefixo da query.

## 6. Contexto entre Agentes (Formatos)

### Com Exame Analisado (`buildContextPrefix`)
Injetado quando o usuário já processou um exame na conversa atual:
```text
[CONTEXTO DO PACIENTE]
Paciente: Maria Silva
Perfil: gestante | Sexo: feminino
Marcadores alterados: Glicose: 105 mg/dL (Alto), Ferritina: 12 ng/mL (Baixo)
Marcadores ótimos: Vitamina D: 45 ng/mL
[FIM DO CONTEXTO]
```

### Sem Exame (`buildMinimalPrefix`)
Injetado quando a conversa inicia direto em módulos de raciocínio ou prescrição:
```text
[CONTEXTO DO PACIENTE]
Paciente: Maria Silva
Perfil: gestante
Sexo: feminino
Gestação: Gemelar — 3º Trimestre
[FIM DO CONTEXTO]
```

## 7. Conversas sem Paciente

As conversas iniciadas na tela principal (sem paciente selecionado) utilizam a tabela `general_chats`:
- O `agent_type` define qual agente responderá (geralmente `research` ou `reasoning`).
- O objeto `meta` é enviado com campos de paciente nulos ou vazios.
- Nenhum prefixo de contexto é injetado, permitindo uma conversa limpa e genérica.

---
*Documentação gerada automaticamente baseada na implementação atual do sistema.*
