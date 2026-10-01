-- Applies changed Client Records fields in batches while preserving all other JSON values.
create or replace function public.bulk_patch_client_records(
  p_organisation_id uuid,
  p_patches jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  n integer;
begin
  if jsonb_typeof(p_patches) is distinct from 'array' then
    raise exception 'p_patches must be a JSON array';
  end if;

  update public.clients as c
  set
    custom_values = c.custom_values || coalesce(p.patch, '{}'::jsonb),
    name = case
      when p.patch ? 'Particulars'
        then coalesce(nullif(btrim(p.patch->>'Particulars'), ''), c.name)
      else c.name
    end,
    updated_at = now()
  from jsonb_to_recordset(p_patches) as p(id uuid, patch jsonb)
  where c.id = p.id
    and c.organisation_id = p_organisation_id
    and c.custom_values->>'source' = 'client_records_register'
    and p.patch is not null
    and p.patch <> '{}'::jsonb;

  get diagnostics n = row_count;
  return n;
end
$function$;

revoke all on function public.bulk_patch_client_records(uuid, jsonb) from public;
grant execute on function public.bulk_patch_client_records(uuid, jsonb) to service_role;
