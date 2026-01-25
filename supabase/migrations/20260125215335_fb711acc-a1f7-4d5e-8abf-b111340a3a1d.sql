-- Add resend_email_id column to store the Resend internal ID
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS resend_email_id text;