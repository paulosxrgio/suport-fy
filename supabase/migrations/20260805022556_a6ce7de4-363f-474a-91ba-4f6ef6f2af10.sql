-- 1) tickets: remove null store_id bypass
DROP POLICY IF EXISTS "Users can view tickets from their stores" ON public.tickets;
DROP POLICY IF EXISTS "Users can create tickets in their stores" ON public.tickets;
DROP POLICY IF EXISTS "Users can update tickets from their stores" ON public.tickets;
DROP POLICY IF EXISTS "Users can delete tickets from their stores" ON public.tickets;

CREATE POLICY "Users can view tickets from their stores" ON public.tickets
FOR SELECT TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

CREATE POLICY "Users can create tickets in their stores" ON public.tickets
FOR INSERT TO authenticated
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

CREATE POLICY "Users can update tickets from their stores" ON public.tickets
FOR UPDATE TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()))
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete tickets from their stores" ON public.tickets
FOR DELETE TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

-- 2) messages: remove null store_id bypass
DROP POLICY IF EXISTS "Users can view messages from their stores" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages in their stores" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages from their stores" ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages from their stores" ON public.messages;

CREATE POLICY "Users can view messages from their stores" ON public.messages
FOR SELECT TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

CREATE POLICY "Users can create messages in their stores" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

CREATE POLICY "Users can update messages from their stores" ON public.messages
FOR UPDATE TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()))
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete messages from their stores" ON public.messages
FOR DELETE TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

-- 3) settings: remove null store_id bypass on select
DROP POLICY IF EXISTS "Users can view their store settings" ON public.settings;
CREATE POLICY "Users can view their store settings" ON public.settings
FOR SELECT TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

-- 4) webhook_events: internal only
REVOKE ALL ON public.webhook_events FROM anon, authenticated;
GRANT ALL ON public.webhook_events TO service_role;
COMMENT ON TABLE public.webhook_events IS 'Internal webhook dedup log. Written only by edge functions using the service role; no client access by design (RLS enabled, no policies).';

-- 5) SECURITY DEFINER trigger functions must not be callable from the API
REVOKE ALL ON FUNCTION public.update_ticket_last_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- 6) storage: private, store-scoped access to email attachments
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Service role upload" ON storage.objects;

CREATE POLICY "Store owners can read their email attachments" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.tickets t
    JOIN public.stores s ON s.id = t.store_id
    WHERE s.user_id = auth.uid()
      AND t.id::text = split_part(storage.objects.name, '/', 1)
  )
);