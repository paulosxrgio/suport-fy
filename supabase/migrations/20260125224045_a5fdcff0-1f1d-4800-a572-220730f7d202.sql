-- Add AI Agent configuration columns to settings table
ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS openai_api_key text,
ADD COLUMN IF NOT EXISTS ai_model text DEFAULT 'gpt-4o',
ADD COLUMN IF NOT EXISTS ai_system_prompt text,
ADD COLUMN IF NOT EXISTS ai_response_delay integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS ai_is_active boolean DEFAULT false;