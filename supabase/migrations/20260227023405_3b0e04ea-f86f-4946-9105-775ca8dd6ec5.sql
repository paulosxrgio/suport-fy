ALTER TABLE settings
ADD COLUMN IF NOT EXISTS shopify_client_id text,
ADD COLUMN IF NOT EXISTS shopify_client_secret text;