-- Add is_read column to tickets table
ALTER TABLE public.tickets 
ADD COLUMN is_read boolean NOT NULL DEFAULT true;