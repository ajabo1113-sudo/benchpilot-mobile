-- BenchPilot cloud sync: one private workshop snapshot per Supabase account.
-- Safe to run more than once. No service-role key or dashboard credentials are used.

create table if not exists public.user_workshop (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_workshop_data_shape check (
    jsonb_typeof(data) = 'object'
    and jsonb_typeof(data -> 'version') = 'number'
    and jsonb_typeof(data -> 'projects') = 'array'
    and jsonb_typeof(data -> 'materials') = 'array'
    and jsonb_typeof(data -> 'builds') = 'array'
    and jsonb_typeof(data -> 'settings') = 'object'
  )
);

alter table public.user_workshop enable row level security;

revoke all on table public.user_workshop from anon, authenticated;
grant select, insert, update on table public.user_workshop to authenticated;

drop policy if exists "Users can read their own workshop" on public.user_workshop;
create policy "Users can read their own workshop"
  on public.user_workshop for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own workshop" on public.user_workshop;
create policy "Users can create their own workshop"
  on public.user_workshop for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own workshop" on public.user_workshop;
create policy "Users can update their own workshop"
  on public.user_workshop for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists user_workshop_updated_at_idx
  on public.user_workshop (updated_at desc);
