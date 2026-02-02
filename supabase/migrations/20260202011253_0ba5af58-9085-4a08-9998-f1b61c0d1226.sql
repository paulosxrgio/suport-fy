-- Corrigir política da tabela settings para ser baseada em lojas
DROP POLICY IF EXISTS "Allow all operations on settings" ON public.settings;

CREATE POLICY "Users can view settings"
ON public.settings FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage settings"
ON public.settings FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);