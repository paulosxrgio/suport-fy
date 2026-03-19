
create table response_quality_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  ticket_id uuid references tickets(id) on delete cascade,
  customer_email text,
  customer_message text,
  ai_response text,
  sentiment text,
  score integer,
  issues jsonb default '[]',
  positive_aspects jsonb default '[]',
  prompt_version integer default 1,
  created_at timestamptz default now()
);

create index on response_quality_log (store_id, created_at);
create index on response_quality_log (store_id, score);

alter table response_quality_log enable row level security;

create policy "Users can view their store quality logs"
on response_quality_log for select using (
  store_id in (select id from stores where user_id = auth.uid())
);

create policy "Users can insert quality logs for their stores"
on response_quality_log for insert with check (
  store_id in (select id from stores where user_id = auth.uid())
);

create policy "Users can delete their store quality logs"
on response_quality_log for delete using (
  store_id in (select id from stores where user_id = auth.uid())
);

create table prompt_suggestions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  current_prompt text,
  suggested_prompt text,
  reason text,
  issues_found jsonb default '[]',
  avg_score_before integer,
  responses_analyzed integer,
  status text default 'pending',
  applied_at timestamptz,
  created_at timestamptz default now()
);

alter table prompt_suggestions enable row level security;

create policy "Users can view their store prompt suggestions"
on prompt_suggestions for select using (
  store_id in (select id from stores where user_id = auth.uid())
);

create policy "Users can insert prompt suggestions for their stores"
on prompt_suggestions for insert with check (
  store_id in (select id from stores where user_id = auth.uid())
);

create policy "Users can update their store prompt suggestions"
on prompt_suggestions for update using (
  store_id in (select id from stores where user_id = auth.uid())
);

create policy "Users can delete their store prompt suggestions"
on prompt_suggestions for delete using (
  store_id in (select id from stores where user_id = auth.uid())
);

alter table settings
add column if not exists prompt_version integer default 1,
add column if not exists prompt_auto_improve boolean default false;
