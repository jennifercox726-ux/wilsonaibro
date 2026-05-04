-- user_preferences: key/value style + decision store
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pref_key TEXT NOT NULL,
  pref_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'inferred',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pref_key)
);

CREATE INDEX idx_user_preferences_user ON public.user_preferences(user_id);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own preferences" ON public.user_preferences
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all preferences" ON public.user_preferences
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- strategic_memory: PE decisions w/ vector embeddings
CREATE TABLE public.strategic_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  topic TEXT NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_strategic_memory_user ON public.strategic_memory(user_id);

ALTER TABLE public.strategic_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own memory" ON public.strategic_memory
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own memory" ON public.strategic_memory
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own memory" ON public.strategic_memory
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own memory" ON public.strategic_memory
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all memory" ON public.strategic_memory
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_strategic_memory_updated_at
  BEFORE UPDATE ON public.strategic_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- match_strategic_memory: semantic recall helper
CREATE OR REPLACE FUNCTION public.match_strategic_memory(
  _user_id uuid,
  _query_embedding vector,
  _match_count integer DEFAULT 5,
  _min_similarity double precision DEFAULT 0.5
)
RETURNS TABLE(id uuid, topic text, decision text, rationale text, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sm.id, sm.topic, sm.decision, sm.rationale,
         1 - (sm.embedding <=> _query_embedding) AS similarity
  FROM public.strategic_memory sm
  WHERE sm.user_id = _user_id
    AND sm.embedding IS NOT NULL
    AND 1 - (sm.embedding <=> _query_embedding) > _min_similarity
  ORDER BY sm.embedding <=> _query_embedding ASC
  LIMIT _match_count;
$$;

-- pe_drafts: auto-generated Preliminary Impact & Profit reports
CREATE TABLE public.pe_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'webhook',
  raw_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  title TEXT NOT NULL DEFAULT 'Untitled Draft',
  impact_summary TEXT,
  profit_summary TEXT,
  full_report TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pe_drafts_user_created ON public.pe_drafts(user_id, created_at DESC);

ALTER TABLE public.pe_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own drafts" ON public.pe_drafts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own drafts" ON public.pe_drafts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own drafts" ON public.pe_drafts
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all drafts" ON public.pe_drafts
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pe_drafts_updated_at
  BEFORE UPDATE ON public.pe_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime for drafts so the sidebar updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.pe_drafts;