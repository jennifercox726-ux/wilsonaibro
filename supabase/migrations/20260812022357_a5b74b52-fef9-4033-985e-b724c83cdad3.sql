
-- shared trigger fn
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  referral_source TEXT,
  core_dream TEXT,
  emotional_vibe TEXT DEFAULT 'neutral',
  membership_tier TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- conversations
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Thread',
  share_token TEXT UNIQUE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT ON public.conversations TO anon;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own conversations" ON public.conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON public.conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON public.conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view public conversations" ON public.conversations FOR SELECT TO anon, authenticated USING (is_public = true AND share_token IS NOT NULL);
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX conversations_share_token_idx ON public.conversations(share_token) WHERE share_token IS NOT NULL;

-- messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT ON public.messages TO anon;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view messages in own conversations" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can create messages in own conversations" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can delete messages in own conversations" ON public.messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Anyone can view messages of public conversations" ON public.messages FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.is_public = true AND c.share_token IS NOT NULL));
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- query_logs
CREATE TABLE public.query_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  query_length INTEGER NOT NULL DEFAULT 0,
  response_length INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.query_logs TO authenticated;
GRANT ALL ON public.query_logs TO service_role;
ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own query logs" ON public.query_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own query logs" ON public.query_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_query_logs_user_id ON public.query_logs(user_id);
CREATE INDEX idx_query_logs_created_at ON public.query_logs(created_at DESC);

-- roles
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can view all query logs" ON public.query_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can view all conversations" ON public.conversations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can view all messages" ON public.messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- sovereignty
CREATE TABLE public.sovereignty_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  last_ping TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_in_window_hours INTEGER NOT NULL DEFAULT 48,
  protocol_triggered BOOLEAN NOT NULL DEFAULT false,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sovereignty_status TO authenticated;
GRANT ALL ON public.sovereignty_status TO service_role;
ALTER TABLE public.sovereignty_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sovereignty status" ON public.sovereignty_status FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sovereignty status" ON public.sovereignty_status FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sovereignty status" ON public.sovereignty_status FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sovereignty status" ON public.sovereignty_status FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all sovereignty status" ON public.sovereignty_status FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_sovereignty_status_updated_at BEFORE UPDATE ON public.sovereignty_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sovereignty_sentinels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sovereignty_sentinels TO authenticated;
GRANT ALL ON public.sovereignty_sentinels TO service_role;
ALTER TABLE public.sovereignty_sentinels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sentinels" ON public.sovereignty_sentinels FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sentinels" ON public.sovereignty_sentinels FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sentinels" ON public.sovereignty_sentinels FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sentinels" ON public.sovereignty_sentinels FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all sentinels" ON public.sovereignty_sentinels FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_sovereignty_sentinels_updated_at BEFORE UPDATE ON public.sovereignty_sentinels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sovereignty_sentinels_user_id ON public.sovereignty_sentinels(user_id);

-- dispatcher
CREATE TYPE public.dispatch_tier AS ENUM ('auto','confirm');
CREATE TYPE public.dispatch_status AS ENUM ('pending_confirmation','dispatched','failed','expired','cancelled');
CREATE TYPE public.dispatch_trigger_source AS ENUM ('manual','test_fire','sentinel_auto','sentinel_confirmed');

CREATE TABLE public.dispatch_workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workflow_file TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  tier public.dispatch_tier NOT NULL DEFAULT 'confirm',
  armed BOOLEAN NOT NULL DEFAULT false,
  ref TEXT NOT NULL DEFAULT 'main',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, workflow_file)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_workflows TO authenticated;
GRANT ALL ON public.dispatch_workflows TO service_role;
ALTER TABLE public.dispatch_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own workflows" ON public.dispatch_workflows FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own workflows" ON public.dispatch_workflows FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own workflows" ON public.dispatch_workflows FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own workflows" ON public.dispatch_workflows FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all workflows" ON public.dispatch_workflows FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_dispatch_workflows_updated_at BEFORE UPDATE ON public.dispatch_workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dispatch_workflows_user ON public.dispatch_workflows(user_id);

CREATE TABLE public.dispatch_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workflow_id UUID NOT NULL REFERENCES public.dispatch_workflows(id) ON DELETE CASCADE,
  trigger_source public.dispatch_trigger_source NOT NULL,
  status public.dispatch_status NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  github_status_code INT,
  github_response TEXT,
  error_message TEXT,
  confirmed_by_sentinel_id UUID REFERENCES public.sovereignty_sentinels(id) ON DELETE SET NULL,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dispatch_log TO authenticated;
GRANT ALL ON public.dispatch_log TO service_role;
ALTER TABLE public.dispatch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own dispatch log" ON public.dispatch_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all dispatch log" ON public.dispatch_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_dispatch_log_updated_at BEFORE UPDATE ON public.dispatch_log FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dispatch_log_user_created ON public.dispatch_log(user_id, created_at DESC);
CREATE INDEX idx_dispatch_log_workflow ON public.dispatch_log(workflow_id);

CREATE TABLE public.dispatch_confirmations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  dispatch_log_id UUID NOT NULL REFERENCES public.dispatch_log(id) ON DELETE CASCADE,
  sentinel_id UUID NOT NULL REFERENCES public.sovereignty_sentinels(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dispatch_confirmations TO authenticated;
GRANT ALL ON public.dispatch_confirmations TO service_role;
ALTER TABLE public.dispatch_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own confirmations" ON public.dispatch_confirmations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all confirmations" ON public.dispatch_confirmations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_dispatch_confirmations_token ON public.dispatch_confirmations(token);
CREATE INDEX idx_dispatch_confirmations_log ON public.dispatch_confirmations(dispatch_log_id);
CREATE INDEX idx_dispatch_confirmations_user ON public.dispatch_confirmations(user_id);

-- saved snippets
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
CREATE POLICY "Users manage their own snippets" ON public.saved_snippets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX saved_snippets_user_idx ON public.saved_snippets(user_id, created_at DESC);

-- yolo mode
CREATE TABLE public.yolo_mode (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  engaged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yolo_mode TO authenticated;
GRANT ALL ON public.yolo_mode TO service_role;
ALTER TABLE public.yolo_mode ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own yolo" ON public.yolo_mode FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
