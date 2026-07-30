-- Internal per-Task-Code messaging (team-scoped).
create table if not exists public.task_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  task_code text not null,
  team text,
  author_id uuid,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_messages_org_code_idx
  on public.task_messages(organisation_id, task_code, created_at);

alter table public.task_messages enable row level security;

drop policy if exists "members read task messages" on public.task_messages;
create policy "members read task messages"
on public.task_messages for select
using (organisation_id = public.current_user_organisation_id());
