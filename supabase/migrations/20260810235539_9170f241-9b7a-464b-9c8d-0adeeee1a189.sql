-- Adicionar coluna reasons à tabela ai_feedback
ALTER TABLE public.ai_feedback 
ADD COLUMN IF NOT EXISTS reasons text[] DEFAULT '{}';

-- Criar tabela para métricas de abandono
CREATE TABLE IF NOT EXISTS public.ai_feedback_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('negative_popup_open', 'negative_popup_close_without_send')),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- Garantir acesso
GRANT SELECT, INSERT ON public.ai_feedback_metrics TO authenticated;
GRANT ALL ON public.ai_feedback_metrics TO service_role;

-- RLS
ALTER TABLE public.ai_feedback_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own metrics" ON public.ai_feedback_metrics
FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can view all metrics" ON public.ai_feedback_metrics
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
