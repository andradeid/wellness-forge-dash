CREATE TABLE public.curation_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (length(btrim(description)) >= 10),
  request_type TEXT NOT NULL DEFAULT 'outro'
    CHECK (request_type IN ('resposta_incorreta','resposta_incompleta','alucinacao','formatacao','sugestao_melhoria','outro')),
  priority TEXT NOT NULL DEFAULT 'media'
    CHECK (priority IN ('baixa','media','alta','critica')),
  status TEXT NOT NULL DEFAULT 'registrado'
    CHECK (status IN ('registrado','em_analise','classificado','aprovado','rejeitado','arquivado')),
  agent_key TEXT,
  message_id UUID,
  chat_id UUID,
  patient_id UUID,
  -- campos exclusivos do sistema / super admin
  ai_classification TEXT,
  ai_confidence NUMERIC,
  ai_justification TEXT,
  ai_technical_direction TEXT,
  admin_final_classification TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_curation_requests_created_by ON public.curation_requests(created_by);
CREATE INDEX idx_curation_requests_status ON public.curation_requests(status);
CREATE INDEX idx_curation_requests_created_at ON public.curation_requests(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.curation_requests TO authenticated;
GRANT DELETE ON public.curation_requests TO authenticated;
GRANT ALL ON public.curation_requests TO service_role;

ALTER TABLE public.curation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curation_select_own_or_staff"
ON public.curation_requests FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'curator'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "curation_insert_own"
ON public.curation_requests FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "curation_update_own_while_registrado"
ON public.curation_requests FOR UPDATE TO authenticated
USING (created_by = auth.uid() AND status = 'registrado')
WITH CHECK (created_by = auth.uid() AND status = 'registrado');

CREATE POLICY "curation_update_super_admin"
ON public.curation_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "curation_delete_super_admin"
ON public.curation_requests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Bloqueio a nivel de coluna: campos reservados so mudam via super_admin ou service_role
CREATE OR REPLACE FUNCTION public.guard_curation_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.has_role(v_uid, 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.ai_classification IS DISTINCT FROM OLD.ai_classification
     OR NEW.ai_confidence IS DISTINCT FROM OLD.ai_confidence
     OR NEW.ai_justification IS DISTINCT FROM OLD.ai_justification
     OR NEW.ai_technical_direction IS DISTINCT FROM OLD.ai_technical_direction
     OR NEW.admin_final_classification IS DISTINCT FROM OLD.admin_final_classification
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Campos de classificação, notas internas e situação são exclusivos do super admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_curation_guard_protected
BEFORE UPDATE ON public.curation_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_curation_protected_columns();

CREATE TRIGGER trg_curation_updated_at
BEFORE UPDATE ON public.curation_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE EXECUTE ON FUNCTION public.guard_curation_protected_columns() FROM anon, authenticated;