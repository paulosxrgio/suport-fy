-- Enable RLS on webhook_events (internal use only by edge function with service role)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- No public policies needed - only service role key can access this table