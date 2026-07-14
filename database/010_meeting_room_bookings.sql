create table if not exists public.meeting_room_bookings (
  id uuid primary key default gen_random_uuid(),
  organisation_code text not null default 'DCO1433',
  booking_date date not null,
  room_name text not null,
  floor text not null,
  from_time text not null,
  to_time text not null,
  team_name text not null,
  purpose text not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_room_bookings_org_date_idx
on public.meeting_room_bookings (organisation_code, booking_date, room_name, from_time);

alter table public.meeting_room_bookings enable row level security;

drop policy if exists "members read meeting room bookings" on public.meeting_room_bookings;
create policy "members read meeting room bookings"
on public.meeting_room_bookings for select
to authenticated
using (
  organisation_code = coalesce((auth.jwt() -> 'user_metadata' ->> 'organisation_id'), 'DCO1433')
);

drop policy if exists "members create meeting room bookings" on public.meeting_room_bookings;
create policy "members create meeting room bookings"
on public.meeting_room_bookings for insert
to authenticated
with check (
  organisation_code = coalesce((auth.jwt() -> 'user_metadata' ->> 'organisation_id'), 'DCO1433')
);

drop policy if exists "members update meeting room bookings" on public.meeting_room_bookings;
create policy "members update meeting room bookings"
on public.meeting_room_bookings for update
to authenticated
using (
  organisation_code = coalesce((auth.jwt() -> 'user_metadata' ->> 'organisation_id'), 'DCO1433')
)
with check (
  organisation_code = coalesce((auth.jwt() -> 'user_metadata' ->> 'organisation_id'), 'DCO1433')
);

drop policy if exists "members delete meeting room bookings" on public.meeting_room_bookings;
create policy "members delete meeting room bookings"
on public.meeting_room_bookings for delete
to authenticated
using (
  organisation_code = coalesce((auth.jwt() -> 'user_metadata' ->> 'organisation_id'), 'DCO1433')
);
