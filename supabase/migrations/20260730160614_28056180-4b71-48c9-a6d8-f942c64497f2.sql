DELETE FROM public.user_roles WHERE user_id = 'c25e33b4-14dd-444c-9906-2e5e01c0233a';

INSERT INTO public.user_roles (user_id, role)
VALUES ('c25e33b4-14dd-444c-9906-2e5e01c0233a', 'curator')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.integration_logs (source, event, status, message, payload)
VALUES (
  'admin-users',
  'manual_user_creation',
  'success',
  'Conta de automação MCP criada manualmente a pedido do super admin',
  jsonb_build_object(
    'created_user_id', 'c25e33b4-14dd-444c-9906-2e5e01c0233a',
    'email', 'mcp@lumma.ia.br',
    'full_name', 'MCP Curadoria (automação)',
    'creator_role', 'super_admin',
    'reason', 'Acesso automatizado somente leitura via servidor MCP de curadoria (papel curator, princípio do menor privilégio). Sem plano; conta de máquina, não humana.',
    'plan_slug', null,
    'human_account', false
  )
);