-- The app does not use realtime subscriptions for messages.
-- Unpublish the table to eliminate cross-user broadcast risk.
ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;