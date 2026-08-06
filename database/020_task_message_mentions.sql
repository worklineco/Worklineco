-- Direct @mentions on task chats: private message to one person, shown in their dashboard.
alter table public.task_messages
  add column if not exists recipient_email text,
  add column if not exists recipient_id uuid,
  add column if not exists is_private boolean not null default false,
  add column if not exists entity text,
  add column if not exists task text,
  add column if not exists read_at timestamptz;

create index if not exists task_messages_recipient_idx
  on public.task_messages (organisation_id, recipient_id, created_at desc);
