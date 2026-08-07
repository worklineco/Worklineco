-- Speed up the dashboard chat list (view=threads), which filters task_messages
-- by organisation_id and the last 30 days of created_at. Without this index
-- Postgres scans the whole task_messages table on every dashboard load.

create index if not exists task_messages_org_created_idx
  on public.task_messages (organisation_id, created_at desc);

analyze public.task_messages;
