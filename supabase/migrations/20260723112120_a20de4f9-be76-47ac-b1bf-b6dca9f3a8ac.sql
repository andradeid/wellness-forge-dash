UPDATE public.email_templates
SET html = replace(
  html,
  '<p style="margin:0 0 16px;">Sua conta foi <strong>migrada com plano ilimitado</strong>. Você mantém tudo o que já tinha e ganha acesso aos novos super agentes clínicos.</p>',
  '<p style="margin:0 0 8px;">Sua conta foi <strong>migrada com plano de créditos ilimitados</strong>*. Você mantém tudo o que já tinha e ganha acesso aos novos super agentes clínicos.</p><p style="margin:0 0 16px;font-size:12px;color:#888;">*de acordo com o seu tempo de acesso.</p>'
),
updated_at = now()
WHERE key = 'welcome_migrated';