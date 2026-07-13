create table if not exists public.firm_billing_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  organisation_code text not null default 'DCO1433',
  owner_team text,
  source_module text not null default 'manual',
  gstat_appeal_id uuid references public.gstat_appeals(id) on delete set null,
  cost_center text,
  person_authorised text,
  voucher_type text,
  income_head text,
  group_name text,
  client text not null default '',
  gstin text,
  place_of_supply text,
  registration_type text,
  poc_name text,
  poc_mobile text,
  poc_email text,
  description text,
  amount numeric not null default 0,
  cgst numeric not null default 0,
  sgst numeric not null default 0,
  igst numeric not null default 0,
  total numeric not null default 0,
  billing_status text not null default 'Draft',
  memo_no text,
  memo_date date,
  invoice_no text,
  invoice_date date,
  ope numeric not null default 0,
  ope_remarks text,
  receiving_status text not null default 'Pending',
  receiving_date date,
  remarks text,
  version_no integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists firm_billing_records_org_idx
on public.firm_billing_records (organisation_id, organisation_code, invoice_date desc, created_at desc);

alter table public.firm_billing_records
add column if not exists ope numeric not null default 0;

alter table public.firm_billing_records
add column if not exists ope_remarks text;

alter table public.firm_billing_records
add column if not exists place_of_supply text;

alter table public.firm_billing_records
add column if not exists registration_type text;

alter table public.firm_billing_records
add column if not exists receiving_date date;

create index if not exists firm_billing_records_team_idx
on public.firm_billing_records (organisation_id, owner_team);

create index if not exists firm_billing_records_gstat_appeal_idx
on public.firm_billing_records (gstat_appeal_id);

create table if not exists public.firm_deleted_billing_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  organisation_code text not null default 'DCO1433',
  original_billing_id uuid,
  data jsonb not null default '{}'::jsonb,
  delete_action text not null default 'delete',
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists firm_deleted_billing_records_org_idx
on public.firm_deleted_billing_records (organisation_id, deleted_at desc);

create table if not exists public.firm_billing_master_options (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  organisation_code text not null default 'DCO1433',
  option_type text not null,
  label text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, option_type, label)
);

create index if not exists firm_billing_master_options_org_type_idx
on public.firm_billing_master_options (organisation_id, option_type, label);

alter table public.firm_billing_records enable row level security;
alter table public.firm_deleted_billing_records enable row level security;
alter table public.firm_billing_master_options enable row level security;

drop policy if exists "members read firm billing records in own organisation" on public.firm_billing_records;
create policy "members read firm billing records in own organisation"
on public.firm_billing_records for select
to authenticated
using (
  organisation_id = public.current_user_organisation_id()
  or organisation_code = 'DCO1433'
);

drop policy if exists "members read deleted firm billing records in own organisation" on public.firm_deleted_billing_records;
create policy "members read deleted firm billing records in own organisation"
on public.firm_deleted_billing_records for select
to authenticated
using (
  organisation_id = public.current_user_organisation_id()
  or organisation_code = 'DCO1433'
);

drop policy if exists "members read firm billing masters in own organisation" on public.firm_billing_master_options;
create policy "members read firm billing masters in own organisation"
on public.firm_billing_master_options for select
to authenticated
using (
  organisation_id = public.current_user_organisation_id()
  or organisation_code = 'DCO1433'
);

do $$
begin
  if to_regclass('public.gstat_billing_records') is not null then
    insert into public.firm_billing_records (
      amount,
      billing_status,
      cgst,
      client,
      description,
      gstin,
      gstat_appeal_id,
      igst,
      invoice_date,
      invoice_no,
      organisation_code,
      organisation_id,
      receiving_status,
      remarks,
      sgst,
      source_module,
      total,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    select
      legacy.professional_fee,
      legacy.billing_status,
      legacy.cgst,
      legacy.client,
      legacy.matter_description,
      legacy.gstin,
      legacy.gstat_appeal_id,
      legacy.igst,
      legacy.invoice_date,
      legacy.invoice_number,
      legacy.organisation_code,
      (select id from public.organisations where slug = lower(legacy.organisation_code) limit 1),
      coalesce(nullif(legacy.payment_status, ''), 'Pending'),
      legacy.remarks,
      legacy.sgst,
      'gstat',
      legacy.total,
      legacy.created_by,
      legacy.updated_by,
      legacy.created_at,
      legacy.updated_at
    from public.gstat_billing_records legacy
    where not exists (
      select 1
      from public.firm_billing_records firm
      where firm.organisation_code = legacy.organisation_code
        and coalesce(firm.gstat_appeal_id::text, '') = coalesce(legacy.gstat_appeal_id::text, '')
        and coalesce(firm.invoice_no, '') = coalesce(legacy.invoice_number, '')
        and coalesce(firm.client, '') = coalesce(legacy.client, '')
    );
  end if;
end $$;
