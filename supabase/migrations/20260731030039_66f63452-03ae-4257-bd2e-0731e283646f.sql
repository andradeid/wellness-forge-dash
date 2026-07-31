-- ============================================================
-- CHANGELOG DE RODADAS DE CURADORIA (adição pura)
-- ============================================================

CREATE TABLE public.changelog_rounds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rodada_data date NOT NULL UNIQUE,
  titulo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.changelog_rounds TO authenticated;
GRANT ALL ON public.changelog_rounds TO service_role;
ALTER TABLE public.changelog_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Curadoria pode ver rodadas"
  ON public.changelog_rounds FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'curator'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admin gerencia rodadas"
  ON public.changelog_rounds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_changelog_rounds_updated_at
  BEFORE UPDATE ON public.changelog_rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------

CREATE TABLE public.changelog_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES public.changelog_rounds(id) ON DELETE CASCADE,
  descricao_legivel text NOT NULL,
  classificacao text NOT NULL CHECK (classificacao IN ('suporte', 'melhoria')),
  camada text NOT NULL CHECK (camada IN ('dify', 'lovable', 'banco')),
  descricao_tecnica text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_changelog_items_round ON public.changelog_items(round_id);

GRANT SELECT ON public.changelog_items TO authenticated;
GRANT ALL ON public.changelog_items TO service_role;
ALTER TABLE public.changelog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Curadoria pode ver itens"
  ON public.changelog_items FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'curator'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admin gerencia itens"
  ON public.changelog_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_changelog_items_updated_at
  BEFORE UPDATE ON public.changelog_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------

CREATE TABLE public.changelog_item_reports (
  item_id uuid NOT NULL REFERENCES public.changelog_items(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.curation_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, request_id)
);

CREATE INDEX idx_changelog_item_reports_request ON public.changelog_item_reports(request_id);

GRANT SELECT ON public.changelog_item_reports TO authenticated;
GRANT ALL ON public.changelog_item_reports TO service_role;
ALTER TABLE public.changelog_item_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Curadoria pode ver vinculos"
  ON public.changelog_item_reports FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'curator'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admin gerencia vinculos"
  ON public.changelog_item_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));