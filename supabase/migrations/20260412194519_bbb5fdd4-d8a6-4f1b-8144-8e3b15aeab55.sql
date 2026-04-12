
CREATE TABLE public.query_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  query_length INTEGER NOT NULL DEFAULT 0,
  response_length INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own query logs"
ON public.query_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own query logs"
ON public.query_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE INDEX idx_query_logs_user_id ON public.query_logs(user_id);
CREATE INDEX idx_query_logs_created_at ON public.query_logs(created_at DESC);
