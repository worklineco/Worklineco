-- Database-level fail-safe: a Task Code can exist on only ONE billing row per
-- organisation (case-insensitive). Even if the app ever misbehaves again, the
-- database itself now refuses a second push of the same task.
-- Run AFTER duplicates are removed, or the index creation will fail and name
-- the offending code.
create unique index if not exists firm_billing_records_org_task_code_uidx
on public.firm_billing_records (organisation_id, upper(task_code))
where task_code is not null and task_code <> '';
