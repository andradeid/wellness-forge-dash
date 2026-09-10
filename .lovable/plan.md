# Registro de erros da IA (Dify)

## Onde vai ficar

Aproveitando a tela que já existe: **Auditoria** (`/app/admin/credits-audit`), que hoje tem as abas "Ações operacionais" e "Créditos". Entra uma terceira aba, **"Erros da IA"**, visível apenas para o super admin.

Motivo: é a tela que já concentra registro histórico e já é restrita a perfis administrativos. Analytics é agregado/gráfico, não serve para inspecionar ocorrência a ocorrência.

## O que passa a ser gravado

Uma tabela nova só para isso, com uma linha por falha:

- data e hora
- usuária (nome e e-mail) e conversa
- perfil do paciente e tarefa enviada (`selected_task`)
- agente/card usado
- o erro bruto que o Dify devolveu, sem tratamento, mais o código HTTP
- tipo de erro classificado (tempo esgotado, alta demanda, arquivo não lido, roteamento, conexão, outro)
- duração em milissegundos até falhar
- se havia arquivo anexado, quantos, nome e tipo do arquivo
- se a mensagem foi cobrada em crédito e se houve retentativa

## Onde os erros são capturados

Três caminhos, todos passam a gravar:

1. **No servidor** (`src/routes/api/dify.chat.tsx`) — falha de conexão, tempo esgotado (504) e resposta de erro do Dify. Aqui está o corpo bruto e o tempo exato.
2. **Durante a resposta** (`useDifyChat`, `useGeneralChat`) — quando o Dify emite erro no meio do envio ou entrega texto de falha técnica no lugar da análise.
3. **Roteamento de tarefa** — quando cai na resposta genérica que já detectamos hoje.

A mensagem amigável para a usuária continua exatamente igual. O registro é paralelo e silencioso.

## A tela

- Filtro por período (24h, 7 dias, 30 dias, 90 dias) e busca por usuária, conversa ou trecho do erro
- Filtros por perfil, tarefa e tipo de erro
- Cartões no topo com total por tipo de erro no período
- Tabela paginada; ao clicar na linha abre o painel lateral com o erro bruto completo e todo o contexto, com botão de copiar
- Painel de padrão: distribuição por hora do dia, por perfil, por tarefa e por tipo de arquivo — para enxergar concentração

## Detalhes técnicos

- Tabela `public.dify_error_logs` com `GRANT` e RLS: leitura só para `super_admin`; escrita apenas pelo service role (as gravações passam por server function/rota de servidor).
- Server function `logDifyError` em `src/lib/dify-errors.functions.ts` para os caminhos do cliente; gravação direta com o cliente admin dentro da rota `api/dify.chat`.
- Leitura em `src/lib/dify-errors-admin.functions.ts`: `listDifyErrors`, `getDifyErrorStats` — ambas exigem `super_admin`.
- Componente `src/components/admin/DifyErrorsSection.tsx`, consumido por `app.admin.credits-audit.tsx`.
- Truncamento do erro bruto em 20 KB por registro; índices por `created_at`, `error_kind`, `selected_task`.
- Sem Realtime; leitura sob demanda via TanStack Query.
