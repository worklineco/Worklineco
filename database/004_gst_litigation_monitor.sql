create table if not exists public.gst_litigation_cases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  gst_registration_id uuid not null references public.gst_registrations(id) on delete cascade,
  serial_no integer,
  notice_type text,
  description text,
  ref_id text,
  date_of_issue date,
  case_id text,
  status text,
  tax_period text,
  due_date date,
  section text,
  reply_filing_status text,
  source text not null default 'manual',
  raw_payload jsonb not null default '{}'::jsonb,
  scraped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, gst_registration_id, ref_id, case_id)
);

alter table public.gst_litigation_cases enable row level security;

drop policy if exists "members read gst litigation cases" on public.gst_litigation_cases;
create policy "members read gst litigation cases"
on public.gst_litigation_cases for select
using (organisation_id = public.current_user_organisation_id());

drop policy if exists "members insert gst litigation cases" on public.gst_litigation_cases;
create policy "members insert gst litigation cases"
on public.gst_litigation_cases for insert
with check (organisation_id = public.current_user_organisation_id());

drop policy if exists "members update gst litigation cases" on public.gst_litigation_cases;
create policy "members update gst litigation cases"
on public.gst_litigation_cases for update
using (organisation_id = public.current_user_organisation_id())
with check (organisation_id = public.current_user_organisation_id());

drop policy if exists "members delete gst litigation cases" on public.gst_litigation_cases;
create policy "members delete gst litigation cases"
on public.gst_litigation_cases for delete
using (organisation_id = public.current_user_organisation_id());

create index if not exists gst_litigation_cases_org_due_idx
on public.gst_litigation_cases (organisation_id, due_date, status);

create index if not exists gst_litigation_cases_registration_idx
on public.gst_litigation_cases (gst_registration_id, date_of_issue desc);
