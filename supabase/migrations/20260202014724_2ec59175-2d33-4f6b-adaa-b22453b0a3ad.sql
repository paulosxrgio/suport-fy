-- Add store_id column to settings table
ALTER TABLE public.settings 
ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- Add UNIQUE constraint (each store can only have one settings row)
ALTER TABLE public.settings 
ADD CONSTRAINT settings_store_id_unique UNIQUE (store_id);

-- Create index for faster lookups
CREATE INDEX idx_settings_store_id ON public.settings(store_id);

-- Update RLS policies to be store-aware
DROP POLICY IF EXISTS "Authenticated users can manage settings" ON public.settings;
DROP POLICY IF EXISTS "Users can view settings" ON public.settings;

-- New policy: Users can view their own store's settings
CREATE POLICY "Users can view their store settings"
ON public.settings FOR SELECT
USING (
  store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())
  OR store_id IS NULL
);

-- New policy: Users can insert settings for their stores
CREATE POLICY "Users can create settings for their stores"
ON public.settings FOR INSERT
WITH CHECK (
  store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())
);

-- New policy: Users can update their store's settings
CREATE POLICY "Users can update their store settings"
ON public.settings FOR UPDATE
USING (
  store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())
);

-- New policy: Users can delete their store's settings
CREATE POLICY "Users can delete their store settings"
ON public.settings FOR DELETE
USING (
  store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())
);