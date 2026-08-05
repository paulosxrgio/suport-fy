ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS email_headers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS auto_reply_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS needs_human boolean NOT NULL DEFAULT false;