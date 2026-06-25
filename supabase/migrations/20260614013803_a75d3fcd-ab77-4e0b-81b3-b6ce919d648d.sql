CREATE TABLE public.saved_snippets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_snippets TO authenticated;
GRANT ALL ON public.saved_snippets TO service_role;
ALTER TABLE public.saved_snippets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own snippets" ON public.saved_snippets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX saved_snippets_user_idx ON public.saved_snippets(user_id, created_at DESC);