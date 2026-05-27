create table if not exists public.gstat_appeals (
  id uuid primary key default gen_random_uuid(),
  organisation_code text not null default 'DCO1433',
  row_number integer not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gstat_appeals_organisation_code_idx
on public.gstat_appeals (organisation_code, row_number);

create table if not exists public.gstat_audit_logs (
  id uuid primary key default gen_random_uuid(),
  appeal_id uuid references public.gstat_appeals(id) on delete set null,
  organisation_code text not null default 'DCO1433',
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gstat_audit_logs_appeal_id_idx
on public.gstat_audit_logs (appeal_id, created_at desc);

create index if not exists gstat_audit_logs_organisation_code_idx
on public.gstat_audit_logs (organisation_code, created_at desc);

alter table public.gstat_appeals enable row level security;
alter table public.gstat_audit_logs enable row level security;

drop policy if exists "authenticated users read gstat appeals" on public.gstat_appeals;
create policy "authenticated users read gstat appeals"
on public.gstat_appeals for select
to authenticated
using (true);

drop policy if exists "authenticated users read gstat audit logs" on public.gstat_audit_logs;
create policy "authenticated users read gstat audit logs"
on public.gstat_audit_logs for select
to authenticated
using (true);
