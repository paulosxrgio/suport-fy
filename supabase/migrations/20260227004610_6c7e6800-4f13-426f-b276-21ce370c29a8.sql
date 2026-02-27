
-- Drop the overly permissive policy and replace with store-owner scoped ones
drop policy "Service role can manage queue" on public.auto_reply_queue;

create policy "Users can insert queue items for their stores"
  on public.auto_reply_queue
  for insert
  with check (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "Users can update their store queue items"
  on public.auto_reply_queue
  for update
  using (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "Users can delete their store queue items"
  on public.auto_reply_queue
  for delete
  using (store_id in (select id from public.stores where user_id = auth.uid()));
