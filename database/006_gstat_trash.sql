create table if not exists public.gstat_deleted_appeals (
  id uuid primary key default gen_random_uuid(),
  original_appeal_id uuid,
  organisation_code text not null default 'DCO1433',
  original_row_number integer not null,
  data jsonb not null default '{}'::jsonb,
  delete_action text not null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  restored_by uuid references auth.users(id) on delete set null,
  restored_at timestamptz
);

create index if not exists gstat_deleted_appeals_organisation_code_idx
on public.gstat_deleted_appeals (organisation_code, deleted_at desc);

create index if not exists gstat_deleted_appeals_expires_at_idx
on public.gstat_deleted_appeals (expires_at);

alter table public.gstat_deleted_appeals enable row level security;

drop policy if exists "authenticated users read gstat deleted appeals" on public.gstat_deleted_appeals;
create policy "authenticated users read gstat deleted appeals"
on public.gstat_deleted_appeals for select
to authenticated
using (true);
