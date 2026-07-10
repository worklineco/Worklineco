create table if not exists public.partner_threads (
  id uuid primary key default gen_random_uuid(),
  organisation_code text not null default 'DCO1433',
  title text not null,
  member_ids uuid[] not null default '{}'::uuid[],
  members text not null default '',
  messages jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_threads_member_ids_idx
on public.partner_threads using gin (member_ids);

create index if not exists partner_threads_organisation_code_idx
on public.partner_threads (organisation_code, updated_at desc);

alter table public.partner_threads enable row level security;

drop policy if exists "authenticated users read partner threads" on public.partner_threads;
create policy "authenticated users read partner threads"
on public.partner_threads for select
to authenticated
using (auth.uid() = any(member_ids));
