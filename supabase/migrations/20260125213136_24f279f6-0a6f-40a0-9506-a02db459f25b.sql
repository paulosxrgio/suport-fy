-- Add sender identity columns to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS sender_email text;