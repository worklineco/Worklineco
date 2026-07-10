create table if not exists public.engagement_letter_log (
  id uuid primary key default gen_random_uuid(),
  organisation_code text not null default 'DCO1433',
  el_no text not null,
  entity_name text not null,
  nature_of_assignment text not null,
  team_number text not null,
  generated_date date not null default current_date,
  approval_status text not null default 'Pending',
  signed_el_link text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists engagement_letter_log_organisation_code_idx
on public.engagement_letter_log (organisation_code, generated_date desc, created_at desc);

alter table public.engagement_letter_log enable row level security;

drop policy if exists "authenticated users read engagement letter log" on public.engagement_letter_log;
create policy "authenticated users read engagement letter log"
on public.engagement_letter_log for select
to authenticated
using (true);
