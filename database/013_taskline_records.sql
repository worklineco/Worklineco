create table if not exists public.firm_taskline_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  organisation_code text not null default 'DCO1433',
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists firm_taskline_records_org_idx
on public.firm_taskline_records (organisation_id, organisation_code, created_at desc);

create index if not exists firm_taskline_records_data_gin_idx
on public.firm_taskline_records using gin (data);

alter table public.firm_taskline_records enable row level security;

do $$
begin
  create policy "members read taskline in own organisation"
  on public.firm_taskline_records for select
  using (organisation_id = public.current_user_organisation_id());
exception
  when duplicate_object then null;
end $$;
