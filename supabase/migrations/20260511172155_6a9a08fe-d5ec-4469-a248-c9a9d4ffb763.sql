CREATE TYPE public.ai_feedback_rating AS ENUM ('positive', 'negative', 'suggestion');

CREATE TABLE public.ai_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  rating public.ai_feedback_rating NOT NULL,
  comment TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_feedback_message ON public.ai_feedback(message_id);
CREATE INDEX idx_ai_feedback_created_by ON public.ai_feedback(created_by);

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutri inserts own feedback"
  ON public.ai_feedback FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Nutri selects own feedback"
  ON public.ai_feedback FOR SELECT
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Nutri updates own feedback"
  ON public.ai_feedback FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Nutri deletes own feedback"
  ON public.ai_feedback FOR DELETE
  USING (auth.uid() = created_by);

CREATE TRIGGER update_ai_feedback_updated_at
  BEFORE UPDATE ON public.ai_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();