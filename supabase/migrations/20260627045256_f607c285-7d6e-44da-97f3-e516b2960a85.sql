
-- ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_patients_created_by_created_at
  ON public.patients (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_exams_uploaded_by
  ON public.patient_exams (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_patient_exam_results_created_by
  ON public.patient_exam_results (created_by);

CREATE INDEX IF NOT EXISTS idx_user_roles_role
  ON public.user_roles (role);

-- Bonus: cobre filtros .in(patient_id) usados na tela de pacientes
CREATE INDEX IF NOT EXISTS idx_patient_exams_patient_id
  ON public.patient_exams (patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_exam_results_patient_id
  ON public.patient_exam_results (patient_id);

-- =========================================================
-- DIVIDIR POLICIES RLS: remover OR has_role e separar em 2
-- =========================================================

-- patients
DROP POLICY IF EXISTS "Nutri selects own patients" ON public.patients;
CREATE POLICY "Nutri selects own patients"
  ON public.patients FOR SELECT TO authenticated
  USING (auth.uid() = created_by);
CREATE POLICY "Super admin selects all patients"
  ON public.patients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- patient_exams
DROP POLICY IF EXISTS "Nutri selects own exams" ON public.patient_exams;
CREATE POLICY "Nutri selects own exams"
  ON public.patient_exams FOR SELECT TO authenticated
  USING (auth.uid() = uploaded_by);
CREATE POLICY "Super admin selects all exams"
  ON public.patient_exams FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- patient_exam_results
DROP POLICY IF EXISTS "Nutri selects own exam results" ON public.patient_exam_results;
CREATE POLICY "Nutri selects own exam results"
  ON public.patient_exam_results FOR SELECT TO authenticated
  USING (auth.uid() = created_by);
CREATE POLICY "Super admin selects all exam results"
  ON public.patient_exam_results FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- patient_chats
DROP POLICY IF EXISTS "Nutri selects own chats" ON public.patient_chats;
CREATE POLICY "Nutri selects own chats"
  ON public.patient_chats FOR SELECT TO authenticated
  USING (auth.uid() = created_by);
CREATE POLICY "Super admin selects all chats SELECT"
  ON public.patient_chats FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- chat_messages
DROP POLICY IF EXISTS "Nutri selects own messages" ON public.chat_messages;
CREATE POLICY "Nutri selects own messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (auth.uid() = created_by);
CREATE POLICY "Super admin selects all messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
