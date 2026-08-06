-- Speed up TaskLine / GSTAT / module list loads.
-- The API filters public.tasks by organisation_id and the JSON key
-- custom_values->>'workline_module', then orders by created_at (list)
-- or due_at (notifications / calendar). Without an index Postgres does a
-- full sequential scan + sort of the whole tasks table on every load.
-- These expression indexes make that filter + ordering fast.

create index if not exists tasks_org_module_created_idx
  on public.tasks (organisation_id, ((custom_values ->> 'workline_module')), created_at);

create index if not exists tasks_org_module_due_idx
  on public.tasks (organisation_id, ((custom_values ->> 'workline_module')), due_at);

-- Optional: keep planner stats fresh right after creating the indexes.
analyze public.tasks;
