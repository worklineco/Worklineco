create table if not exists public.applause_posts (
  id uuid primary key default gen_random_uuid(),
  organisation_code text not null default 'DCO1433',
  audience text not null default 'everyone' check (audience in ('everyone', 'group', 'person')),
  recipient_ids uuid[] not null default '{}'::uuid[],
  recipient_names text not null default '',
  tagged_ids uuid[] not null default '{}'::uuid[],
  tagged_names text not null default '',
  message text not null,
  created_by uuid references auth.users(id) on delete set null,
  author_name text not null default 'WorkLine User',
  created_at timestamptz not null default now()
);

create index if not exists applause_posts_organisation_code_idx
on public.applause_posts (organisation_code, created_at desc);

create index if not exists applause_posts_recipient_ids_idx
on public.applause_posts using gin (recipient_ids);

create index if not exists applause_posts_tagged_ids_idx
on public.applause_posts using gin (tagged_ids);

alter table public.applause_posts enable row level security;

drop policy if exists "authenticated users read applause posts" on public.applause_posts;
create policy "authenticated users read applause posts"
on public.applause_posts for select
to authenticated
using (
  audience = 'everyone'
  or auth.uid() = created_by
  or auth.uid() = any(recipient_ids)
  or auth.uid() = any(tagged_ids)
);
