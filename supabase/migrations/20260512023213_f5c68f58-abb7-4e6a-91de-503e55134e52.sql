DROP FUNCTION IF EXISTS public.reset_all_dify_conversations();

CREATE POLICY "Super admin updates all chats"
ON public.patient_chats
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));