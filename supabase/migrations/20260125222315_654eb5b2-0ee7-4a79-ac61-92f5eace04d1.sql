-- Create webhook_events table for deduplication
CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  svix_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_webhook_events_svix_id ON public.webhook_events(svix_id);

-- Auto-cleanup old events (optional, keep 7 days)
CREATE INDEX idx_webhook_events_processed_at ON public.webhook_events(processed_at);