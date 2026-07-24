
CREATE POLICY "Support views user_credits" ON public.user_credits FOR SELECT TO authenticated USING (has_role(auth.uid(), 'support'::app_role));
CREATE POLICY "Support views credit_transactions" ON public.credit_transactions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'support'::app_role));
CREATE POLICY "Support views patients" ON public.patients FOR SELECT TO authenticated USING (has_role(auth.uid(), 'support'::app_role));
CREATE POLICY "Support views patient_chats" ON public.patient_chats FOR SELECT TO authenticated USING (has_role(auth.uid(), 'support'::app_role));
CREATE POLICY "Support views patient_exams" ON public.patient_exams FOR SELECT TO authenticated USING (has_role(auth.uid(), 'support'::app_role));
GRANT SELECT ON public.user_credits, public.credit_transactions, public.patients, public.patient_chats, public.patient_exams TO authenticated;
