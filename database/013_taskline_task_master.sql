-- Master list of TaskLine task types (firm-wide, per organisation).
create table if not exists public.taskline_task_master (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create index if not exists taskline_task_master_org_idx
  on public.taskline_task_master(organisation_id);

alter table public.taskline_task_master enable row level security;

drop policy if exists "members read taskline task master" on public.taskline_task_master;
create policy "members read taskline task master"
on public.taskline_task_master for select
using (organisation_id = public.current_user_organisation_id());
