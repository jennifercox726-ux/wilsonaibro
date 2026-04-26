
-- Restrict sovereignty_status policies to authenticated role
DROP POLICY IF EXISTS "Users can view own sovereignty status" ON public.sovereignty_status;
DROP POLICY IF EXISTS "Users can create own sovereignty status" ON public.sovereignty_status;
DROP POLICY IF EXISTS "Users can update own sovereignty status" ON public.sovereignty_status;
DROP POLICY IF EXISTS "Users can delete own sovereignty status" ON public.sovereignty_status;
DROP POLICY IF EXISTS "Admins can view all sovereignty status" ON public.sovereignty_status;

CREATE POLICY "Users can view own sovereignty status"
  ON public.sovereignty_status FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sovereignty status"
  ON public.sovereignty_status FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sovereignty status"
  ON public.sovereignty_status FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sovereignty status"
  ON public.sovereignty_status FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all sovereignty status"
  ON public.sovereignty_status FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Restrict sovereignty_sentinels policies to authenticated role
DROP POLICY IF EXISTS "Users can view own sentinels" ON public.sovereignty_sentinels;
DROP POLICY IF EXISTS "Users can create own sentinels" ON public.sovereignty_sentinels;
DROP POLICY IF EXISTS "Users can update own sentinels" ON public.sovereignty_sentinels;
DROP POLICY IF EXISTS "Users can delete own sentinels" ON public.sovereignty_sentinels;
DROP POLICY IF EXISTS "Admins can view all sentinels" ON public.sovereignty_sentinels;

CREATE POLICY "Users can view own sentinels"
  ON public.sovereignty_sentinels FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sentinels"
  ON public.sovereignty_sentinels FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sentinels"
  ON public.sovereignty_sentinels FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sentinels"
  ON public.sovereignty_sentinels FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all sentinels"
  ON public.sovereignty_sentinels FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
