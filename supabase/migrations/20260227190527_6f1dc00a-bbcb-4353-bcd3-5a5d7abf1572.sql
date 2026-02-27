
create table public.customer_memory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  customer_email text not null,
  preferred_edition text,
  preferred_language text,
  total_interactions integer default 1,
  last_sentiment text,
  notes text,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(store_id, customer_email)
);

create index idx_customer_memory_store_email on public.customer_memory (store_id, customer_email);

alter table public.customer_memory enable row level security;

create policy "Users can view their store customer memory"
  on public.customer_memory for select
  using (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "Users can insert customer memory for their stores"
  on public.customer_memory for insert
  with check (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "Users can update their store customer memory"
  on public.customer_memory for update
  using (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "Users can delete their store customer memory"
  on public.customer_memory for delete
  using (store_id in (select id from public.stores where user_id = auth.uid()));
