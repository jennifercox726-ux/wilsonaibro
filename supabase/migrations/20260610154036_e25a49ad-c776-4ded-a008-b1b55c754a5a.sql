
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS conversations_share_token_idx ON public.conversations(share_token) WHERE share_token IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'free';

GRANT SELECT ON public.conversations TO anon;
GRANT SELECT ON public.messages TO anon;

CREATE POLICY "Anyone can view public conversations"
  ON public.conversations FOR SELECT
  TO anon, authenticated
  USING (is_public = true AND share_token IS NOT NULL);

CREATE POLICY "Anyone can view messages of public conversations"
  ON public.messages FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.is_public = true
      AND c.share_token IS NOT NULL
  ));
