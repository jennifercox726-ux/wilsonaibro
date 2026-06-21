
CREATE TABLE public.yolo_mode (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  engaged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yolo_mode TO authenticated;
GRANT ALL ON public.yolo_mode TO service_role;
ALTER TABLE public.yolo_mode ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own yolo" ON public.yolo_mode FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
