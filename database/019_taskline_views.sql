-- TaskLine saved views ("My Views")
-- Each row is a personal, named view for one user in one organisation.
-- config holds the full TaskLine state snapshot (filters, value filters,
-- due-date range, status, search, sorting, due colours, active column group,
-- and the column layout: order / hidden / frozen).

create table if not exists public.taskline_views (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id, name)
);

-- One optional default view per user (auto-applied when TaskLine opens).
alter table public.taskline_views
  add column if not exists is_default boolean not null default false;

create index if not exists taskline_views_org_user_idx
  on public.taskline_views (organisation_id, user_id);

alter table public.taskline_views enable row level security;

-- Owners can see and manage only their own views within their organisation.
drop policy if exists "taskline_views_select_own" on public.taskline_views;
create policy "taskline_views_select_own"
  on public.taskline_views for select
  using (user_id = auth.uid());

drop policy if exists "taskline_views_insert_own" on public.taskline_views;
create policy "taskline_views_insert_own"
  on public.taskline_views for insert
  with check (user_id = auth.uid());

drop policy if exists "taskline_views_update_own" on public.taskline_views;
create policy "taskline_views_update_own"
  on public.taskline_views for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "taskline_views_delete_own" on public.taskline_views;
create policy "taskline_views_delete_own"
  on public.taskline_views for delete
  using (user_id = auth.uid());
