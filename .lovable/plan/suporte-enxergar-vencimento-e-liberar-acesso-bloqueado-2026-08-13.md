# Suporte: enxergar vencimento e liberar acesso bloqueado

Objetivo: o time de suporte conseguir ver, direto na Central de nutricionistas, se o plano está vencido e se a conta está realmente bloqueada — e desbloquear com motivo obrigatório e registro de auditoria.

## Situação atual (verificada)

- A lista já busca `current_period_end` da tabela `subscriptions`, mas **não exibe** essa informação em lugar nenhum da tela.
- O selo de status só considera `profiles.is_blocked`. O bloqueio real de login vem de `auth.users.banned_until`, que o navegador não consegue ler — por isso contas banidas aparecem como "Ativa".
- O botão de bloquear/reativar existe, mas está escondido atrás de `isSuperAdmin`. A função de servidor `admin-users` já autoriza `super_admin` **e** `support`, e o endpoint de bloqueio não tem trava extra de papel — a limitação hoje é só de interface.
- O endpoint de bloqueio/desbloqueio não pede motivo nem grava auditoria, diferente da edição de cadastro, que já exige `edit_reason` e registra em `integration_logs`.

## O que será feito

### 1. Nova coluna "Validade" na lista
- Exibir a data de vencimento do plano em formato DD/MM/AAAA.
- Destaque visual quando vencida (texto em tom de alerta + selo "Vencido há X dias").
- Quando não houver assinatura, exibir "—".

### 2. Status real na coluna Status
- Passar a considerar o bloqueio do Auth, não só `is_blocked`.
- Estados: **Ativa**, **Vencida**, **Bloqueada** (login impedido), **Trial**, **Inadimplente**, **Cancelada**.
- Novo filtro de status incluindo "Vencida" e "Bloqueada (login)".

### 3. Suporte podendo desbloquear
- O botão de reativar passa a aparecer para o papel `support`, **somente para desbloquear**. Bloquear e excluir continuam exclusivos do super admin.
- Ao clicar, abre um diálogo pedindo **motivo obrigatório** (mínimo de caracteres), no mesmo padrão já usado na edição de cadastro.
- O desbloqueio limpa o banimento do Auth e `is_blocked`, e grava auditoria com quem liberou, para quem, quando e por quê.

### 4. Painel de detalhes
- No painel lateral de detalhes da usuária, mostrar: validade do plano, origem da assinatura (Migração / Kiwify / Stripe), se está banida no Auth e a data do último acesso.

## Detalhes técnicos

- Nova função SQL `security definer` (ex.: `admin_auth_block_status(uuid[])`) que devolve, para os IDs da página atual, se há `banned_until` vigente em `auth.users`. Executável apenas por `super_admin` e `support`. Isso evita expor a tabela `auth.users` ao cliente.
- `src/routes/app.admin.users.tsx`: nova coluna Validade, cálculo de vencido a partir de `current_period_end`, novo filtro de status, botão de desbloqueio liberado para `support`, diálogo de motivo obrigatório, campos extras no drawer de detalhes.
- `supabase/functions/admin-users/index.ts`: no método de bloqueio/desbloqueio, exigir `reason`, recusar tentativa de **bloquear** feita por `support`, e inserir registro em `integration_logs` (`event: manual_user_block_toggle`) com o motivo e o papel do autor.
- Nada é bloqueado automaticamente por esta mudança: o comportamento do job diário de vencimento continua apenas registrando, sem banir.

## Fora de escopo

- Bloqueio automático por vencimento.
- Alteração de plano ou validade pelo suporte (segue restrito ao super admin).
