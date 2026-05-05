CREATE TABLE public.vibe_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vibe text NOT NULL,
  note text,
  logged_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, logged_on)
);

ALTER TABLE public.vibe_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own vibe logs" ON public.vibe_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own vibe logs" ON public.vibe_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own vibe logs" ON public.vibe_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own vibe logs" ON public.vibe_logs FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all vibe logs" ON public.vibe_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_vibe_logs_updated_at
BEFORE UPDATE ON public.vibe_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_vibe_logs_user_date ON public.vibe_logs(user_id, logged_on DESC);