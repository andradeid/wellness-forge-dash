CREATE TABLE public.patient_exam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  exam_id uuid,
  chat_id uuid,
  created_by uuid NOT NULL,
  marker_name text NOT NULL,
  marker_value numeric,
  marker_value_raw text,
  marker_unit text,
  reference_value text,
  classification text,
  analysis text,
  measured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_per_patient ON public.patient_exam_results (patient_id);
CREATE INDEX idx_per_patient_marker ON public.patient_exam_results (patient_id, marker_name, measured_at DESC);
CREATE INDEX idx_per_exam ON public.patient_exam_results (exam_id);

ALTER TABLE public.patient_exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutri selects own exam results"
  ON public.patient_exam_results FOR SELECT
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Nutri inserts own exam results"
  ON public.patient_exam_results FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Nutri updates own exam results"
  ON public.patient_exam_results FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Nutri deletes own exam results"
  ON public.patient_exam_results FOR DELETE
  USING (auth.uid() = created_by);