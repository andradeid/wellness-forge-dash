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
     OR NEW.grupo_tematico IS DISTINCT FROM OLD.grupo_tematico
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Campos de classificação, notas internas e situação são exclusivos do super admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;