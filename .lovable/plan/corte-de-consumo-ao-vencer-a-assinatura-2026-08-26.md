# Corte de consumo ao vencer a assinatura

Objetivo: quando a assinatura vence, a nutricionista continua entrando e lendo tudo o que já existe, mas não consegue mais rodar agentes de IA. O "créditos ilimitados" da migração é desligado automaticamente, para que ninguém siga usando de graça sem aparecer nos nossos números.

## Regras de negócio

1. Assinatura vencida (`current_period_end < now()`) = **somente leitura**:
   - login normal, painel, pacientes, histórico de conversas e relatórios continuam acessíveis;
   - qualquer tarefa que consome crédito é bloqueada, mesmo com saldo.
2. Ao detectar o vencimento, o job diário desliga `unlimited_credits` da assinatura e registra a mudança no log de expiração. Se a pessoa renovar, o webhook (Stripe/Kiwify) reativa a assinatura; o ilimitado só volta se for um caso de cortesia reativado manualmente pelo admin.
3. Admin, super_admin, support e curator não são afetados.
4. E-mail de aviso de vencimento: enviado uma vez por ciclo, com botão de renovação e contato do suporte.

## Experiência do usuário

- Ao tentar rodar um agente com plano vencido, abre um aviso dedicado (variação do diálogo de créditos): "Sua assinatura venceu em DD/MM/AAAA. Renove para voltar a usar as análises da Lumma." com botão para a página de planos e "Falar com o suporte".
- Um aviso fixo no topo do app enquanto a assinatura estiver vencida.
- O badge de créditos mostra "Plano vencido" no lugar do saldo.

## Painel administrativo

- Card "Assinaturas e vencimentos" ganha a contagem de contas em modo leitura e quantos e-mails de vencimento saíram.
- Na página de nutricionistas, a coluna de validade sinaliza "Somente leitura" para as vencidas.
- Admin pode conceder uma prorrogação (nova data de validade), o que restaura o consumo na hora.

## Detalhes técnicos

**Banco**
- Nova função `public.subscription_is_active(_user_id uuid)` (security definer): true para papéis administrativos, para assinaturas sem vencimento futuro exigido e para `current_period_end >= now()` com status `active`/`trial`.
- `public.consume_credits`: passa a retornar bloqueio quando `subscription_is_active` é falso, antes de qualquer débito. Como a função hoje retorna apenas boolean, muda para retornar `jsonb` (`{ ok, reason }`) — atualizar as chamadas em `src/lib/credits.functions.ts`; nenhum outro consumidor SQL usa a função.
- `public.log_subscription_expiries()`: além de logar, faz `UPDATE subscriptions SET unlimited_credits = false` para as vencidas e marca no `subscription_expiry_log` que o ilimitado foi desligado e se o e-mail foi enfileirado.
- Nova coluna `expiry_email_sent_at` em `subscriptions` para não repetir o e-mail no mesmo ciclo.

**Servidor**
- Novo template `subscription_expired` em `email_templates` (assunto, corpo, variáveis: nome, plano, data de vencimento, link de renovação, WhatsApp do suporte), enviado por `src/lib/emails.server.ts`.
- Rota `src/routes/api/public/subscription-expiry-emails.ts` protegida por segredo, chamada pelo `pg_cron` após o job diário, que envia os e-mails pendentes e grava `expiry_email_sent_at`.
- `getMyCredits` passa a devolver `subscriptionActive`, `currentPeriodEnd` e `planName`.

**Frontend**
- `src/lib/paywall-store.ts` ganha o motivo (`insufficient` | `expired`); `PaywallDialog` renderiza o texto e as ações conforme o motivo.
- `useDifyChat` e `useGeneralChat` verificam `subscriptionActive` antes de chamar `getCost`, abrindo o diálogo de vencimento sem chamar o Dify.
- Faixa de aviso no layout de `src/routes/app.tsx` e ajuste do `CreditsBadge`.

## Ordem de execução

1. Migração: função de status, ajuste do `consume_credits`, coluna de controle de e-mail, template do e-mail.
2. Servidor: server functions, envio de e-mail e rota de disparo agendada.
3. Frontend: paywall por vencimento, faixa de aviso, badge.
4. Admin: contadores e sinalização de somente leitura, prorrogação manual.
