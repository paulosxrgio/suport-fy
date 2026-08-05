ALTER TABLE public.auto_reply_queue
  ADD COLUMN IF NOT EXISTS error_reason text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS anti_loop_reason text;