CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seo_title text,
  seo_description text,
  seo_canonical text,
  sitemap_extra text,
  site_description text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  maintenance_enabled boolean NOT NULL DEFAULT false,
  maintenance_html text NOT NULL DEFAULT '<div style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;background:#fafafa;color:#111;text-align:center;padding:2rem"><div><h1 style="font-size:1.5rem;margin-bottom:.5rem">Estamos em atualização</h1><p style="color:#555">Voltamos em instantes. Obrigado pela paciência.</p></div></div>',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.system_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings readable by everyone"
  ON public.system_settings FOR SELECT
  USING (true);

CREATE POLICY "system_settings insert super_admin"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "system_settings update super_admin"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER system_settings_set_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.system_settings (id) VALUES (gen_random_uuid());