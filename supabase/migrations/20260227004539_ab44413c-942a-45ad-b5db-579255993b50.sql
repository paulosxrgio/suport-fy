
-- RLS policy: allow service role full access (edge functions use service role key)
-- Also allow store owners to view their queue items
create policy "Users can view their store queue items"
  on public.auto_reply_queue
  for select
  using (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "Service role can manage queue"
  on public.auto_reply_queue
  for all
  using (true)
  with check (true);
