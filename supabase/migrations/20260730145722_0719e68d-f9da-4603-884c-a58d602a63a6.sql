ALTER TABLE public.curation_requests
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_confidence_label text,
  ADD COLUMN IF NOT EXISTS ai_functionality text,
  ADD COLUMN IF NOT EXISTS ai_baseline_item text,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_error text,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.curation_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curator_agreement text;

ALTER TABLE public.curation_requests
  DROP CONSTRAINT IF EXISTS curation_requests_ai_status_check;
ALTER TABLE public.curation_requests
  ADD CONSTRAINT curation_requests_ai_status_check
  CHECK (ai_status IN ('pending','done','failed'));

ALTER TABLE public.curation_requests
  DROP CONSTRAINT IF EXISTS curation_requests_curator_agreement_check;
ALTER TABLE public.curation_requests
  ADD CONSTRAINT curation_requests_curator_agreement_check
  CHECK (curator_agreement IS NULL OR curator_agreement IN ('concorda','discorda'));

CREATE INDEX IF NOT EXISTS curation_requests_duplicate_of_idx
  ON public.curation_requests (duplicate_of);

CREATE OR REPLACE FUNCTION public.guard_curation_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.has_role(v_uid, 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.ai_classification IS DISTINCT FROM OLD.ai_classification
     OR NEW.ai_confidence IS DISTINCT FROM OLD.ai_confidence
     OR NEW.ai_confidence_label IS DISTINCT FROM OLD.ai_confidence_label
     OR NEW.ai_justification IS DISTINCT FROM OLD.ai_justification
     OR NEW.ai_technical_direction IS DISTINCT FROM OLD.ai_technical_direction
     OR NEW.ai_status IS DISTINCT FROM OLD.ai_status
     OR NEW.ai_functionality IS DISTINCT FROM OLD.ai_functionality
     OR NEW.ai_baseline_item IS DISTINCT FROM OLD.ai_baseline_item
     OR NEW.ai_analyzed_at IS DISTINCT FROM OLD.ai_analyzed_at
     OR NEW.ai_error IS DISTINCT FROM OLD.ai_error
     OR NEW.duplicate_of IS DISTINCT FROM OLD.duplicate_of
     OR NEW.admin_final_classification IS DISTINCT FROM OLD.admin_final_classification
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Campos de classificação, notas internas e situação são exclusivos do super admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;