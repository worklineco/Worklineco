-- Override project default grants: imports must use the protected managed API.
revoke all on function public.bulk_patch_client_records(uuid, jsonb) from anon, authenticated;
grant execute on function public.bulk_patch_client_records(uuid, jsonb) to service_role;
