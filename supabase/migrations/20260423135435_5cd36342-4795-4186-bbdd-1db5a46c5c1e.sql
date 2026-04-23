-- 1. Tabela brain_reports
CREATE TABLE public.brain_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  score integer,
  critical_errors jsonb DEFAULT '[]'::jsonb,
  patterns_found jsonb DEFAULT '[]'::jsonb,
  prompt_additions jsonb DEFAULT '[]'::jsonb,
  summary text,
  conversations_analyzed integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brain_reports_store_created ON public.brain_reports(store_id, created_at DESC);

ALTER TABLE public.brain_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their store brain reports"
  ON public.brain_reports FOR SELECT
  USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert brain reports for their stores"
  ON public.brain_reports FOR INSERT
  WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their store brain reports"
  ON public.brain_reports FOR UPDATE
  USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their store brain reports"
  ON public.brain_reports FOR DELETE
  USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

-- 2. Cron job diário 23h UTC para invocar supervisor-agent
SELECT cron.schedule(
  'supervisor-agent-daily',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jtrzpznbdzgzxpwtdmod.supabase.co/functions/v1/supervisor-agent',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cnpwem5iZHpnenhwd3RkbW9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNzQzMTEsImV4cCI6MjA4NDk1MDMxMX0.uMzhvY3IP5cH957W-pJ0DCNfNBm8pBoqKKfP8OxYSsE"}'::jsonb,
    body := '{"scheduled": true}'::jsonb
  );
  $$
);