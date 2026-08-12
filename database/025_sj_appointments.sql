-- SJ Appointments is an isolated, reversible schedule for Jatin Shah and CA Somya Jain.
create table if not exists public.sj_appointments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  appointment_date date not null,
  from_time time not null,
  to_time time not null,
  title text not null,
  purpose text not null,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sj_appointments_time_order check (to_time > from_time)
);

create index if not exists sj_appointments_org_date_time_idx
  on public.sj_appointments (organisation_id, appointment_date, from_time, to_time);

create index if not exists sj_appointments_created_by_idx
  on public.sj_appointments (created_by)
  where created_by is not null;

create index if not exists sj_appointments_updated_by_idx
  on public.sj_appointments (updated_by)
  where updated_by is not null;

alter table public.sj_appointments enable row level security;

drop policy if exists "Jatin and Somya read SJ appointments" on public.sj_appointments;
create policy "Jatin and Somya read SJ appointments"
on public.sj_appointments for select
to authenticated
using (
  organisation_id = (select public.current_user_organisation_id())
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'jatinshah.dco@gmail.com',
    'somya.dco@gmail.com'
  )
);

create table if not exists public.sj_appointment_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  appointment_id uuid references public.sj_appointments(id) on delete set null,
  action text not null check (action in ('create', 'update', 'delete')),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_name text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sj_appointment_logs_org_created_idx
  on public.sj_appointment_logs (organisation_id, created_at desc);

create index if not exists sj_appointment_logs_appointment_idx
  on public.sj_appointment_logs (appointment_id)
  where appointment_id is not null;

create index if not exists sj_appointment_logs_actor_idx
  on public.sj_appointment_logs (actor_user_id)
  where actor_user_id is not null;

alter table public.sj_appointment_logs enable row level security;

drop policy if exists "Jatin and Somya read SJ appointment logs" on public.sj_appointment_logs;
create policy "Jatin and Somya read SJ appointment logs"
on public.sj_appointment_logs for select
to authenticated
using (
  organisation_id = (select public.current_user_organisation_id())
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'jatinshah.dco@gmail.com',
    'somya.dco@gmail.com'
  )
);

revoke all on table public.sj_appointments from public, anon, authenticated;
revoke all on table public.sj_appointment_logs from public, anon, authenticated;
grant select on table public.sj_appointments to authenticated;
grant select on table public.sj_appointment_logs to authenticated;
grant all on table public.sj_appointments to service_role;
grant all on table public.sj_appointment_logs to service_role;
