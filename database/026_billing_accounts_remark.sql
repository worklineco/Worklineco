-- "Remark Accounts Team" column on the Billing register.
-- Editable only by Accounts / Partner in the app; other roles see it read-only.
alter table public.firm_billing_records
  add column if not exists accounts_remark text;
