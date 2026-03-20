
alter table public.messages
add column if not exists attachments jsonb default '[]';

insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', true)
on conflict do nothing;

create policy "Public read access"
on storage.objects for select
using (bucket_id = 'email-attachments');

create policy "Service role upload"
on storage.objects for insert
with check (bucket_id = 'email-attachments');
