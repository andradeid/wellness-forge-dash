
## MCP — limitações conhecidas
- As tools de escrita do MCP não apagam rodada de changelog (só itens); rodada criada com data errada precisa ser removida manualmente no banco. Why: decisão de escopo da v1 da escrita, registrada a pedido do dono.

## Subscription origin writes
- Fill origins with database-side empty-value predicates, using `src/lib/subscription-origin.ts` in app code and equivalent conditional updates in existing Edge Functions; this prevents concurrent writes from overwriting an existing origin.
- Pass the provider explicitly to shared user provisioning; the default supports manual creation so purchase-created accounts cannot be mislabeled by an earlier provisioning step.
