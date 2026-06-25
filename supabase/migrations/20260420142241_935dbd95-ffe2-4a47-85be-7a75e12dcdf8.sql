DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
CREATE POLICY "Admins can view all messages" ON public.messages FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));