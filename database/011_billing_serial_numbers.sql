create sequence if not exists public.firm_billing_serial_no_seq;

alter table public.firm_billing_records
add column if not exists serial_no bigint;

alter table public.firm_billing_records
alter column serial_no set default nextval('public.firm_billing_serial_no_seq'::regclass);

with missing_serials as (
  select id
  from public.firm_billing_records
  where serial_no is null
  order by created_at, id
)
update public.firm_billing_records records
set serial_no = nextval('public.firm_billing_serial_no_seq'::regclass)
from missing_serials
where records.id = missing_serials.id;

do $$
declare
  current_serial bigint;
  max_serial bigint;
begin
  select last_value into current_serial from public.firm_billing_serial_no_seq;
  select coalesce(max(serial_no), 0) into max_serial from public.firm_billing_records;
  perform setval('public.firm_billing_serial_no_seq'::regclass, greatest(current_serial, max_serial, 1), true);
end $$;

create unique index if not exists firm_billing_records_serial_no_uidx
on public.firm_billing_records (serial_no);
