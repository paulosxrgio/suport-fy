-- Add threading columns to tickets table
ALTER TABLE public.tickets 
ADD COLUMN thread_subject TEXT,
ADD COLUMN last_message_id TEXT,
ADD COLUMN references_chain TEXT[] DEFAULT '{}';

-- Backfill existing tickets with their current subject as thread_subject
UPDATE public.tickets SET thread_subject = subject WHERE thread_subject IS NULL;