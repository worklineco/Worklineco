create table if not exists public.gst_registrations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  gstin text not null,
  trade_name text,
  state_name text,
  registration_type text not null default 'Regular',
  filing_frequency text not null default 'Monthly',
  portal_status text not null default 'active',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, gstin)
);

create table if not exists public.gst_return_trackers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  gst_registration_id uuid not null references public.gst_registrations(id) on delete cascade,
  return_type text not null,
  period_label text not null,
  period_start date,
  period_end date,
  due_date date,
  status text not null default 'pending',
  filed_at date,
  arn text,
  source text not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, gst_registration_id, return_type, period_label)
);

alter table public.gst_registrations enable row level security;
alter table public.gst_return_trackers enable row level security;

drop policy if exists "members read gst registrations" on public.gst_registrations;
create policy "members read gst registrations"
on public.gst_registrations for select
using (organisation_id = public.current_user_organisation_id());

drop policy if exists "members insert gst registrations" on public.gst_registrations;
create policy "members insert gst registrations"
on public.gst_registrations for insert
with check (organisation_id = public.current_user_organisation_id());

drop policy if exists "members update gst registrations" on public.gst_registrations;
create policy "members update gst registrations"
on public.gst_registrations for update
using (organisation_id = public.current_user_organisation_id())
with check (organisation_id = public.current_user_organisation_id());

drop policy if exists "members delete gst registrations" on public.gst_registrations;
create policy "members delete gst registrations"
on public.gst_registrations for delete
using (organisation_id = public.current_user_organisation_id());

drop policy if exists "members read gst return trackers" on public.gst_return_trackers;
create policy "members read gst return trackers"
on public.gst_return_trackers for select
using (organisation_id = public.current_user_organisation_id());

drop policy if exists "members insert gst return trackers" on public.gst_return_trackers;
create policy "members insert gst return trackers"
on public.gst_return_trackers for insert
with check (organisation_id = public.current_user_organisation_id());

drop policy if exists "members update gst return trackers" on public.gst_return_trackers;
create policy "members update gst return trackers"
on public.gst_return_trackers for update
using (organisation_id = public.current_user_organisation_id())
with check (organisation_id = public.current_user_organisation_id());

drop policy if exists "members delete gst return trackers" on public.gst_return_trackers;
create policy "members delete gst return trackers"
on public.gst_return_trackers for delete
using (organisation_id = public.current_user_organisation_id());

create index if not exists gst_registrations_org_idx
on public.gst_registrations (organisation_id, client_name);

create index if not exists gst_return_trackers_org_due_idx
on public.gst_return_trackers (organisation_id, due_date, status);

create index if not exists gst_return_trackers_registration_idx
on public.gst_return_trackers (gst_registration_id, period_label);
