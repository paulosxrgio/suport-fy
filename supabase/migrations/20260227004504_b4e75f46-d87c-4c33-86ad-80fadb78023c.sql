
create table public.auto_reply_queue (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade not null,
  store_id uuid references public.stores(id) on delete cascade not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);

create index idx_auto_reply_queue_status_scheduled on public.auto_reply_queue (status, scheduled_for);

alter table public.auto_reply_queue enable row level security;
