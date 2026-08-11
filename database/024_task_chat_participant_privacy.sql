-- Restrict Task Chat visibility to explicit participants.
create table if not exists public.task_chat_participants (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  task_code text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organisation_id, task_code, user_id)
);

create index if not exists task_chat_participants_user_idx
  on public.task_chat_participants (organisation_id, user_id, task_code);

alter table public.task_chat_participants enable row level security;

drop policy if exists "members read own task chat participation" on public.task_chat_participants;
create policy "members read own task chat participation"
on public.task_chat_participants for select
to authenticated
using (
  user_id = auth.uid()
  and organisation_id = public.current_user_organisation_id()
);

drop policy if exists "members read task messages" on public.task_messages;
create policy "participants read task messages"
on public.task_messages for select
to authenticated
using (
  organisation_id = public.current_user_organisation_id()
  and exists (
    select 1
    from public.task_chat_participants participant
    where participant.organisation_id = task_messages.organisation_id
      and participant.task_code = task_messages.task_code
      and participant.user_id = auth.uid()
  )
);
