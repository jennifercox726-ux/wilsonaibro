CREATE TABLE public.council_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid,
  prompt text NOT NULL,
  worker_model text NOT NULL,
  finding text NOT NULL,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.council_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own findings" ON public.council_findings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own findings" ON public.council_findings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own findings" ON public.council_findings
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all findings" ON public.council_findings
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_council_findings_user ON public.council_findings(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.match_council_findings(
  _user_id uuid,
  _query_embedding vector,
  _match_count integer DEFAULT 5,
  _min_similarity double precision DEFAULT 0.55
)
RETURNS TABLE(id uuid, worker_model text, finding text, prompt text, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT cf.id, cf.worker_model, cf.finding, cf.prompt,
         1 - (cf.embedding <=> _query_embedding) AS similarity
  FROM public.council_findings cf
  WHERE cf.user_id = _user_id
    AND cf.embedding IS NOT NULL
    AND 1 - (cf.embedding <=> _query_embedding) > _min_similarity
  ORDER BY cf.embedding <=> _query_embedding ASC
  LIMIT _match_count;
$$;