-- Mark whether a billing row is a retainer bill.
alter table public.firm_billing_records add column if not exists is_retainer text;
