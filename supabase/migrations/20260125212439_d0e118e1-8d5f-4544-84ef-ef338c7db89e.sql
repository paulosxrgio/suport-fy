-- Add resend_api_key column to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS resend_api_key text;