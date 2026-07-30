-- Link a billing row to a TaskLine Task Code.
alter table public.firm_billing_records add column if not exists task_code text;
