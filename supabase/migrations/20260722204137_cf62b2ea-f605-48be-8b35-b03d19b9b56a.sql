
CREATE TABLE public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT 'Lumma',
  from_email TEXT NOT NULL DEFAULT 'no-reply@lumma.ia.br',
  segment JSONB NOT NULL DEFAULT '{"type":"all_active"}'::jsonb,
  include_recovery_link BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','sending','paused','done','failed')),
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin manage campaigns" ON public.email_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER trg_email_campaigns_updated BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.email_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  user_id UUID,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  resend_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);
CREATE INDEX idx_ecr_campaign_status ON public.email_campaign_recipients(campaign_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaign_recipients TO authenticated;
GRANT ALL ON public.email_campaign_recipients TO service_role;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin manage recipients" ON public.email_campaign_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.email_templates (key, category, name, description, subject, html, variables, is_active)
VALUES (
  'welcome_migrated',
  'transactional',
  'Boas-vindas — usuários migrados',
  'Enviado aos nutricionistas migrados da Lumma 1 com plano ilimitado. Inclui link de definição de senha.',
  'Bem-vinda à nova Lumma{{first_name_comma}} 💜',
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bem-vinda à nova Lumma</title></head><body style="margin:0;padding:0;background:#faf7f4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f4;padding:32px 12px;"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);"><tr><td style="background:linear-gradient(135deg,#e8a04c 0%,#e89bcf 100%);padding:28px 32px;color:#fff;"><div style="font-size:14px;letter-spacing:2px;text-transform:uppercase;opacity:.9;">Lumma</div><div style="font-size:22px;font-weight:600;margin-top:6px;">Bem-vinda à nova Lumma{{first_name_comma}}</div></td></tr><tr><td style="padding:32px;font-size:15px;line-height:1.65;"><p style="margin:0 0 16px;">Chegou a nova versão da Lumma — mais rápida, mais inteligente e feita para o seu dia a dia clínico.</p><p style="margin:0 0 16px;">Sua conta foi <strong>migrada com plano ilimitado</strong>. Você mantém tudo o que já tinha e ganha acesso aos novos super agentes clínicos.</p><p style="margin:0 0 12px;">Para começar, defina sua senha em 1 clique:</p><p style="margin:24px 0;text-align:center;"><a href="{{reset_password_url}}" style="display:inline-block;background:linear-gradient(135deg,#e8a04c 0%,#e89bcf 100%);color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px;">Definir minha senha</a></p><p style="margin:0 0 16px;font-size:13px;color:#666;">O link expira em 24 horas. Se precisar de outro, clique em <em>Esqueci minha senha</em> na tela de login.</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0;"><p style="margin:0 0 8px;font-weight:600;">Novidades que você vai amar:</p><ul style="margin:0 0 16px 20px;padding:0;color:#444;"><li style="margin:4px 0;">Super agente clínico com contexto do paciente</li><li style="margin:4px 0;">Análise de exames com raciocínio integrado</li><li style="margin:4px 0;">Histórico organizado por paciente</li><li style="margin:4px 0;">PDFs prontos para entregar em consulta</li></ul><p style="margin:16px 0 0;">Qualquer dúvida, chama a gente no WhatsApp — respondemos rápido.</p><p style="margin:20px 0 0;">Com carinho,<br><strong>Equipe Lumma</strong></p></td></tr><tr><td style="padding:16px 32px;background:#f6f3ef;font-size:12px;color:#888;text-align:center;">Você recebeu este e-mail porque sua conta foi migrada para a nova Lumma.<br>Lumma · <a href="{{dashboard_url}}" style="color:#e8a04c;text-decoration:none;">lumma.ia.br</a></td></tr></table></td></tr></table></body></html>',
  '["first_name_comma","reset_password_url","dashboard_url"]'::jsonb,
  true
)
ON CONFLICT (key) DO NOTHING;
