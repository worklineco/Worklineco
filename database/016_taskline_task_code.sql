-- Firm-wide Task Codes for TaskLine: W<FY><MM>-<seq>, sequence resets each month.
create table if not exists public.taskline_code_counters (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  fy_month text not null,
  last_seq integer not null default 0,
  primary key (organisation_id, fy_month)
);

-- Server-only table (accessed via service role, which bypasses RLS).
-- Enable RLS with no policies so browser clients cannot read/write it directly.
alter table public.taskline_code_counters enable row level security;

create or replace function public.next_taskline_code_seq(p_org uuid, p_fy_month text)
returns integer
language plpgsql
as $$
declare
  v_seq integer;
begin
  insert into public.taskline_code_counters (organisation_id, fy_month, last_seq)
  values (p_org, p_fy_month, 1)
  on conflict (organisation_id, fy_month)
  do update set last_seq = public.taskline_code_counters.last_seq + 1
  returning last_seq into v_seq;
  return v_seq;
end;
$$;
