
-- Sovereignty status (heartbeat) table
CREATE TABLE public.sovereignty_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  last_ping TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  check_in_window_hours INTEGER NOT NULL DEFAULT 48,
  protocol_triggered BOOLEAN NOT NULL DEFAULT false,
  triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sovereignty_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sovereignty status"
  ON public.sovereignty_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sovereignty status"
  ON public.sovereignty_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sovereignty status"
  ON public.sovereignty_status FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sovereignty status"
  ON public.sovereignty_status FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sovereignty status"
  ON public.sovereignty_status FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sovereignty_status_updated_at
  BEFORE UPDATE ON public.sovereignty_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Sentinels (trusted allies) table
CREATE TABLE public.sovereignty_sentinels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  notified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sovereignty_sentinels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sentinels"
  ON public.sovereignty_sentinels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sentinels"
  ON public.sovereignty_sentinels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sentinels"
  ON public.sovereignty_sentinels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sentinels"
  ON public.sovereignty_sentinels FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sentinels"
  ON public.sovereignty_sentinels FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sovereignty_sentinels_updated_at
  BEFORE UPDATE ON public.sovereignty_sentinels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_sovereignty_sentinels_user_id ON public.sovereignty_sentinels(user_id);
