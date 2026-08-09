-- Speed up Client Records loads (and GSTIN lookups from Billing/GSTAT).
-- The API filters public.clients by organisation_id and the JSON key
-- custom_values->>'source', then orders by created_at. Without an index
-- Postgres does a full sequential scan of the clients table for every
-- 1000-row page of every load.

create index if not exists clients_org_source_created_idx
  on public.clients (organisation_id, ((custom_values ->> 'source')), created_at, id);

-- Client Records audit trail: newest 50 per organisation + entity type.
create index if not exists audit_logs_org_entity_created_idx
  on public.audit_logs (organisation_id, entity_type, created_at desc);

-- Keep planner stats fresh right after creating the indexes.
analyze public.clients;
analyze public.audit_logs;
