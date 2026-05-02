
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.message_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  message_id UUID,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_embeddings_user ON public.message_embeddings(user_id);
CREATE INDEX idx_message_embeddings_vec ON public.message_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.message_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own embeddings" ON public.message_embeddings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own embeddings" ON public.message_embeddings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all embeddings" ON public.message_embeddings
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.match_user_messages(
  _user_id UUID,
  _query_embedding vector(768),
  _exclude_conversation UUID DEFAULT NULL,
  _match_count INT DEFAULT 5,
  _min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  content TEXT,
  role TEXT,
  conversation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    me.content,
    me.role,
    me.conversation_id,
    me.created_at,
    1 - (me.embedding <=> _query_embedding) AS similarity
  FROM public.message_embeddings me
  WHERE me.user_id = _user_id
    AND (_exclude_conversation IS NULL OR me.conversation_id <> _exclude_conversation)
    AND me.embedding IS NOT NULL
    AND 1 - (me.embedding <=> _query_embedding) > _min_similarity
  ORDER BY me.embedding <=> _query_embedding ASC
  LIMIT _match_count;
$$;
