ALTER TABLE settings ADD COLUMN IF NOT EXISTS anthropic_api_key text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_provider text DEFAULT 'openai';