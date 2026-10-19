# Relatório mensal — consultas somente leitura

Nenhum código, migração ou escrita. Só SELECT, resultados agregados (sem nome/e-mail).

## Períodos (America/Sao_Paulo)
P_AGO 01–16/08, P_SET 01–16/09, P_OUT 01–16/10/2026 (00:00 a 23:59:59).

## Fontes previstas (confirmadas na 1ª consulta)
- Tipo de conta: `subscriptions.origin` — migradas = `migracao`, `migracao_lumma1`, `ajuste_manual_hubla`; pagantes = `kiwify`, `stripe`, `hubla`; demais (manual/interno/nulo) em linha "outros". Exclui staff (`user_roles` super_admin/admin/support) e `profiles.deleted_at`.
- 1. Cadastradas: `profiles.created_at` ≤ fim do período.
- 2/3/4. Uso, análises e créditos: `credit_transactions` (`type='debit'`, `agent_key`, `amount`).
- 5. Usuárias/dia: `credit_transactions` debit, distinct `user_id` por dia BRT.
- 6. Vendas: `payment_history` (Stripe, `kind`) + `integration_logs` (Kiwify/Hubla por `source`/`event`). Se não houver valor líquido, digo que não existe.
- 7. Erros: `dify_error_logs` agrupado por `error_kind` (separando observações de erros reais) e `billed`.

## Saída
Lista de tabelas/colunas usadas, depois uma tabela por item com os três períodos lado a lado. Itens sem dado no banco são declarados como inexistentes.
