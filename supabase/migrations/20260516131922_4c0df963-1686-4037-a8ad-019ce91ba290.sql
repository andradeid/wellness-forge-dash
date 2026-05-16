-- Add exam_date column to patient_exams (defaults to created_at)
ALTER TABLE public.patient_exams
  ADD COLUMN IF NOT EXISTS exam_date timestamptz;

UPDATE public.patient_exams SET exam_date = created_at WHERE exam_date IS NULL;

ALTER TABLE public.patient_exams
  ALTER COLUMN exam_date SET DEFAULT now(),
  ALTER COLUMN exam_date SET NOT NULL;

-- Trigger: when exam_date changes, propagate to measured_at on all results of that exam
CREATE OR REPLACE FUNCTION public.sync_exam_results_measured_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.exam_date IS DISTINCT FROM OLD.exam_date THEN
    UPDATE public.patient_exam_results
       SET measured_at = NEW.exam_date
     WHERE exam_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_exam_results_measured_at ON public.patient_exams;
CREATE TRIGGER trg_sync_exam_results_measured_at
AFTER UPDATE OF exam_date ON public.patient_exams
FOR EACH ROW EXECUTE FUNCTION public.sync_exam_results_measured_at();