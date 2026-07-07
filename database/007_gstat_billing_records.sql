create table if not exists public.gstat_billing_records (
  id uuid primary key default gen_random_uuid(),
  organisation_code text not null default 'DCO1433',
  gstat_appeal_id uuid references public.gstat_appeals(id) on delete set null,
  invoice_number text,
  invoice_date date,
  client text,
  gstin text,
  matter_description text,
  professional_fee numeric not null default 0,
  cgst numeric not null default 0,
  sgst numeric not null default 0,
  igst numeric not null default 0,
  total numeric not null default 0,
  billing_status text not null default 'Draft',
  payment_status text not null default 'Unpaid',
  payment_date date,
  remarks text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gstat_billing_records_organisation_code_idx
on public.gstat_billing_records (organisation_code, invoice_date desc, created_at desc);

create index if not exists gstat_billing_records_gstat_appeal_id_idx
on public.gstat_billing_records (gstat_appeal_id);

alter table public.gstat_billing_records enable row level security;

drop policy if exists "authenticated users read gstat billing records" on public.gstat_billing_records;
create policy "authenticated users read gstat billing records"
on public.gstat_billing_records for select
to authenticated
using (true);
