create extension if not exists "pgcrypto";

create type public.organisation_status as enum (
  'trial',
  'active',
  'past_due',
  'restricted',
  'suspended',
  'cancelled'
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status public.organisation_status not null default 'trial',
  trial_ends_at timestamptz,
  restricted_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  email text not null unique,
  full_name text,
  status text not null default 'active',
  reports_to_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  description text,
  hierarchy_rank integer,
  is_owner_role boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  primary key (user_id, role_id)
);

create table public.permissions (
  key text primary key,
  label text not null,
  module text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  allowed boolean not null default false,
  primary key (role_id, permission_key)
);

create table public.module_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, module_key)
);

create table public.workflow_statuses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  module_key text not null,
  name text not null,
  color text not null default '#2e6d74',
  sort_order integer not null default 0,
  is_closed_status boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organisation_id, module_key, name)
);

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  entity_type text not null,
  label text not null,
  field_type text not null,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  primary_email text,
  primary_phone text,
  custom_values jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  description text,
  status_id uuid references public.workflow_statuses(id) on delete set null,
  priority text not null default 'normal',
  assigned_to uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  due_at timestamptz,
  custom_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

alter table public.organisations enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.module_settings enable row level security;
alter table public.workflow_statuses enable row level security;
alter table public.custom_fields enable row level security;
alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_user_organisation_id()
returns uuid
language sql
security definer
stable
as $$
  select organisation_id from public.users where id = auth.uid()
$$;

create policy "members read own organisation"
on public.organisations for select
using (id = public.current_user_organisation_id());

create policy "members read users in own organisation"
on public.users for select
using (organisation_id = public.current_user_organisation_id());

create policy "members read roles in own organisation"
on public.roles for select
using (organisation_id = public.current_user_organisation_id());

create policy "members read clients in own organisation"
on public.clients for select
using (organisation_id = public.current_user_organisation_id());

create policy "members read tasks in own organisation"
on public.tasks for select
using (organisation_id = public.current_user_organisation_id());

create policy "members read audit logs in own organisation"
on public.audit_logs for select
using (organisation_id = public.current_user_organisation_id());
