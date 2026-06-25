
ALTER TABLE public.profiles
  ADD COLUMN core_dream text,
  ADD COLUMN emotional_vibe text DEFAULT 'neutral';
