-- Add email_message_id column for email threading support
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS email_message_id text;