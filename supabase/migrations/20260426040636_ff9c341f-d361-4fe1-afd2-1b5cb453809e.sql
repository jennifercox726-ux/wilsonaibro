-- Enum for workflow tier
CREATE TYPE public.dispatch_tier AS ENUM ('auto', 'confirm');

-- Enum for dispatch status
CREATE TYPE public.dispatch_status AS ENUM (
  'pending_confirmation',
  'dispatched',
  'failed',
  'expired',
  'cancelled'
);

-- Enum for trigger source
CREATE TYPE public.dispatch_trigger_source AS ENUM (
  'manual',
  'test_fire',
  'sentinel_auto',
  'sentinel_confirmed'
);

-- =========================================================
-- dispatch_workflows: registered GitHub Actions
-- =========================================================
CREATE TABLE public.dispatch_workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workflow_file TEXT NOT NULL,            -- e.g. "example-perimeter-defense.yml"
  display_name TEXT NOT NULL,
  description TEXT,
  tier public.dispatch_tier NOT NULL DEFAULT 'confirm',
  armed BOOLEAN NOT NULL DEFAULT false,    -- defaults disarmed for safety
  ref TEXT NOT NULL DEFAULT 'main',        -- branch/tag/sha to dispatch against
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, workflow_file)
);

CREATE INDEX idx_dispatch_workflows_user ON public.dispatch_workflows(user_id);
CREATE INDEX idx_dispatch_workflows_armed ON public.dispatch_workflows(user_id, armed) WHERE armed = true;

ALTER TABLE public.dispatch_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own workflows"
  ON public.dispatch_workflows FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users create own workflows"
  ON public.dispatch_workflows FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own workflows"
  ON public.dispatch_workflows FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own workflows"
  ON public.dispatch_workflows FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins view all workflows"
  ON public.dispatch_workflows FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_dispatch_workflows_updated_at
  BEFORE UPDATE ON public.dispatch_workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- dispatch_log: every dispatch attempt
-- =========================================================
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

CREATE INDEX idx_dispatch_log_user_created ON public.dispatch_log(user_id, created_at DESC);
CREATE INDEX idx_dispatch_log_workflow ON public.dispatch_log(workflow_id);

ALTER TABLE public.dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dispatch log"
  ON public.dispatch_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins view all dispatch log"
  ON public.dispatch_log FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_dispatch_log_updated_at
  BEFORE UPDATE ON public.dispatch_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- dispatch_confirmations: single-use 12-hour tokens
-- =========================================================
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

CREATE INDEX idx_dispatch_confirmations_token ON public.dispatch_confirmations(token);
CREATE INDEX idx_dispatch_confirmations_log ON public.dispatch_confirmations(dispatch_log_id);
CREATE INDEX idx_dispatch_confirmations_user ON public.dispatch_confirmations(user_id);

ALTER TABLE public.dispatch_confirmations ENABLE ROW LEVEL SECURITY;

-- Owner can read their own pending confirmations (to see status in panel)
CREATE POLICY "Users view own confirmations"
  ON public.dispatch_confirmations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins view all confirmations"
  ON public.dispatch_confirmations FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No direct INSERT/UPDATE/DELETE policies: edge functions use service role.