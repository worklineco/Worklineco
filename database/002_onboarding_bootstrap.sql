insert into public.permissions (key, label, module)
values
  ('dashboard.view', 'View dashboard', 'dashboard'),
  ('client.view', 'View clients', 'client_master'),
  ('client.create', 'Create clients', 'client_master'),
  ('client.edit', 'Edit clients', 'client_master'),
  ('team.view', 'View team', 'team_master'),
  ('team.manage', 'Manage team', 'team_master'),
  ('task.view', 'View tasks', 'task_allocation'),
  ('task.create', 'Create tasks', 'task_allocation'),
  ('task.assign', 'Assign tasks', 'task_allocation'),
  ('task.edit', 'Edit tasks', 'task_allocation'),
  ('role.manage', 'Manage roles', 'roles'),
  ('settings.manage', 'Manage settings', 'settings'),
  ('billing.manage', 'Manage subscription and billing', 'billing')
on conflict (key) do update
set label = excluded.label,
    module = excluded.module;

drop policy if exists "members read user roles in own organisation" on public.user_roles;
create policy "members read user roles in own organisation"
on public.user_roles for select
using (organisation_id = public.current_user_organisation_id());

drop policy if exists "members read role permissions in own organisation" on public.role_permissions;
create policy "members read role permissions in own organisation"
on public.role_permissions for select
using (organisation_id = public.current_user_organisation_id());

drop policy if exists "members read module settings in own organisation" on public.module_settings;
create policy "members read module settings in own organisation"
on public.module_settings for select
using (organisation_id = public.current_user_organisation_id());

drop policy if exists "members read workflow statuses in own organisation" on public.workflow_statuses;
create policy "members read workflow statuses in own organisation"
on public.workflow_statuses for select
using (organisation_id = public.current_user_organisation_id());

drop policy if exists "members read custom fields in own organisation" on public.custom_fields;
create policy "members read custom fields in own organisation"
on public.custom_fields for select
using (organisation_id = public.current_user_organisation_id());

create or replace function public.bootstrap_organisation(
  p_organisation_name text,
  p_organisation_type text default 'Professional services firm',
  p_owner_name text default null,
  p_owner_role_name text default 'Owner',
  p_hierarchy_labels text[] default array['Owner', 'Manager', 'Staff'],
  p_task_statuses text[] default array['Pending', 'In Progress', 'Under Review', 'Completed']
)
returns table (
  organisation_id uuid,
  organisation_name text,
  organisation_slug text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_existing_organisation_id uuid;
  v_organisation_id uuid;
  v_role_id uuid;
  v_slug_base text;
  v_slug text;
  v_counter integer := 0;
  v_label text;
  v_sort_order integer := 0;
  v_color text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_organisation_name), '') is null then
    raise exception 'Organisation name is required';
  end if;

  select au.email
  into v_email
  from auth.users au
  where au.id = v_user_id;

  if v_email is null then
    raise exception 'Authenticated user email was not found';
  end if;

  select u.organisation_id
  into v_existing_organisation_id
  from public.users u
  where u.id = v_user_id;

  if v_existing_organisation_id is not null then
    return query
      select o.id, o.name, o.slug
      from public.organisations o
      where o.id = v_existing_organisation_id;
    return;
  end if;

  v_slug_base := lower(regexp_replace(trim(p_organisation_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);

  if v_slug_base = '' then
    v_slug_base := 'organisation';
  end if;

  v_slug := v_slug_base;

  while exists (select 1 from public.organisations where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug := v_slug_base || '-' || v_counter::text;
  end loop;

  insert into public.organisations (name, slug, status, trial_ends_at)
  values (trim(p_organisation_name), v_slug, 'trial', now() + interval '14 days')
  returning id into v_organisation_id;

  insert into public.roles (
    organisation_id,
    name,
    description,
    hierarchy_rank,
    is_owner_role
  )
  values (
    v_organisation_id,
    trim(coalesce(nullif(p_owner_role_name, ''), 'Owner')),
    'Initial owner role created during onboarding',
    1,
    true
  )
  returning id into v_role_id;

  insert into public.users (
    id,
    organisation_id,
    email,
    full_name,
    status
  )
  values (
    v_user_id,
    v_organisation_id,
    v_email,
    nullif(trim(coalesce(p_owner_name, '')), ''),
    'active'
  );

  insert into public.user_roles (user_id, role_id, organisation_id)
  values (v_user_id, v_role_id, v_organisation_id);

  insert into public.role_permissions (role_id, permission_key, organisation_id, allowed)
  select v_role_id, p.key, v_organisation_id, true
  from public.permissions p
  on conflict (role_id, permission_key) do update
  set allowed = excluded.allowed;

  insert into public.module_settings (organisation_id, module_key, enabled, settings)
  values
    (v_organisation_id, 'organisation_profile', true, jsonb_build_object('organisation_type', p_organisation_type)),
    (v_organisation_id, 'dashboard', true, '{}'::jsonb),
    (v_organisation_id, 'client_master', true, '{}'::jsonb),
    (v_organisation_id, 'team_master', true, '{}'::jsonb),
    (v_organisation_id, 'task_allocation', true, jsonb_build_object('hierarchy_labels', p_hierarchy_labels)),
    (v_organisation_id, 'billing', true, '{}'::jsonb)
  on conflict (organisation_id, module_key) do update
  set settings = excluded.settings,
      enabled = excluded.enabled,
      updated_at = now();

  foreach v_label in array p_task_statuses loop
    v_label := trim(v_label);

    if v_label <> '' then
      v_sort_order := v_sort_order + 1;
      v_color := case
        when lower(v_label) like '%complete%' or lower(v_label) like '%done%' then '#16a34a'
        when lower(v_label) like '%review%' then '#7c3aed'
        when lower(v_label) like '%client%' or lower(v_label) like '%wait%' then '#d97706'
        when lower(v_label) like '%progress%' then '#0284c7'
        else '#2e6d74'
      end;

      insert into public.workflow_statuses (
        organisation_id,
        module_key,
        name,
        color,
        sort_order,
        is_closed_status
      )
      values (
        v_organisation_id,
        'task_allocation',
        v_label,
        v_color,
        v_sort_order,
        lower(v_label) like '%complete%' or lower(v_label) like '%done%'
      )
      on conflict (organisation_id, module_key, name) do update
      set color = excluded.color,
          sort_order = excluded.sort_order,
          is_closed_status = excluded.is_closed_status;
    end if;
  end loop;

  insert into public.audit_logs (
    organisation_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    new_value
  )
  values (
    v_organisation_id,
    v_user_id,
    'organisation.bootstrap',
    'organisation',
    v_organisation_id,
    jsonb_build_object(
      'organisation_name', p_organisation_name,
      'organisation_type', p_organisation_type,
      'owner_role_name', p_owner_role_name,
      'hierarchy_labels', p_hierarchy_labels,
      'task_statuses', p_task_statuses
    )
  );

  return query
    select o.id, o.name, o.slug
    from public.organisations o
    where o.id = v_organisation_id;
end;
$$;

revoke all on function public.bootstrap_organisation(text, text, text, text, text[], text[]) from public;
grant execute on function public.bootstrap_organisation(text, text, text, text, text[], text[]) to authenticated;
