
-- Create requests table
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  customer_name text,
  customer_email text,
  type text not null,
  description text not null,
  details jsonb default '{}',
  status text not null default 'pending',
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- Indexes
create index idx_requests_status_created on public.requests (status, created_at);
create index idx_requests_store_status on public.requests (store_id, status);

-- Enable RLS
alter table public.requests enable row level security;

-- RLS policies
create policy "Users can view their store requests"
  on public.requests for select
  using (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "Users can insert requests for their stores"
  on public.requests for insert
  with check (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "Users can update their store requests"
  on public.requests for update
  using (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "Users can delete their store requests"
  on public.requests for delete
  using (store_id in (select id from public.stores where user_id = auth.uid()));
