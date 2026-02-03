-- Add columns for store visibility and display order
ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS is_visible_in_dashboard boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_stores_display_order ON public.stores(display_order ASC);