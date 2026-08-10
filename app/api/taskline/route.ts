import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { createTransport } from "nodemailer";
import { isViewOnlyRegisterUser, viewOnlyRegisterResponse } from "@/lib/register-access";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type TaskLineRow = Record<string, string>;
type TaskLineImportRow = TaskLineRow & { import_action?: string; serial_no?: string; target_id?: string };
type TaskRecord = {
  created_at: string;
  created_by: string | null;
  custom_values: {
    taskline_data?: TaskLineRow;
    workline_module?: string;
  } | null;
  description: string | null;
  due_at: string | null;
  id: string;
  organisation_id: string;
  title: string;
  updated_at: string;
};
type AuditLog = {
  action: string;
  actor_name?: string | null;
  actor_user_id?: string | null;
  created_at: string;
  entity_id: string | null;
  id: string;
  new_value: unknown;
  old_value: unknown;
};
type TaskNotification = {
  due_date: string;
  entity: string;
  id: string;
  kind: "assigned" | "due_tomorrow";
  occurred_at: string;
  task: string;
};
type AccessScope = {
  canViewAll: boolean;
  role: string;
  team: string;
};
type TaskLineQuery = {
  columnFilters: Record<string, string>;
  dueColorFilter: string[];
  search: string;
  sortState: { dir: "asc" | "desc"; key: string } | null;
  statusFilter: string;
  valueFilters: Record<string, string[]>;
};

const defaultOrganisationCode = "DCO1433";
const fetchBatchSize = 1000;
const maxTaskLineWindowSize = 400;
const moduleKey = "taskline";
const organisationIdCache = new Map<string, string>();
const taskLineDateColumns = new Set(["due_date", "ref_date", "entry_date", "completion_date"]);
const taskLineMoneyColumns = new Set(["total_agreed_fee", "amount_raised", "amount_realised", "counsel_fee", "referral_fee"]);
const taskLineNumberColumns = new Set(["reminder_days"]);
const taskLineColumns = [
  "task_code",
  "team",
  "name",
  "resource",
  "entity_group",
  "entity",
  "state_name",
  "gstin",
  "task",
  "due_date",
  "stage",
  "status_open_close",
  "billable",
  "remarks",
  "ref_date",
  "ref_no",
  "period",
  "section",
  "issue",
  "refer_other_task",
  "appeal_no",
  "order_type",
  "court_location",
  "engaged_counsel",
  "printing",
  "billing_status",
  "el_reference",
  "tax_invoice_no",
  "realisation_status",
  "reminder_days",
  "reminder_email",
  "remaining_days",
  "status",
  "entry_date",
  "completion_date",
  "poc",
  "pending_from",
  "document_link",
  "total_agreed_fee",
  "amount_raised",
  "amount_realised",
  "counsel_fee",
  "referral_fee",
  "fee_comments",
  "any_other",
  "any_other_1"
];

export async function GET(request: Request) {
  console.time("taskline:requireUser");
  const auth = await requireUser();
  console.timeEnd("taskline:requireUser");

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  console.time("taskline:getOrganisationId");
  const organisation = await getOrganisationId(admin, auth.user);
  console.timeEnd("taskline:getOrganisationId");

  if ("error" in organisation) {
    return organisation.error;
  }

  const access = getAccess(auth.user);
  const searchParams = new URL(request.url).searchParams;
  const view = searchParams.get("view");

  if (view === "notifications") {
    return loadTaskLineNotifications(admin, organisation.organisationId, auth.user);
  }

  if (view === "calendar") {
    return loadCalendarEvents(admin, organisation.organisationId, auth.user, access);
  }

  if (view === "audit") {
    return NextResponse.json({ auditLogs: await loadAuditLogs(admin, organisation.organisationId, access) });
  }

  if (view === "codes") {
    const records = await loadTaskLineRecords(admin, organisation.organisationId, access);
    if (records.error) {
      return NextResponse.json({ error: records.error.message }, { status: 500 });
    }
    const codes = (records.data ?? [])
      .map(formatRecord)
      .filter((row) => text(row.task_code))
      .map((row) => ({
        code: text(row.task_code),
        entity: text(row.entity || row.entity_group),
        task: text(row.task),
        team: text(row.team)
      }));
    return NextResponse.json({ codes });
  }

  if (view === "filter-options") {
    const column = text(searchParams.get("column"));

    if (column === "serial_no") {
      return NextResponse.json({ column, values: [] });
    }

    if (!taskLineColumns.includes(column)) {
      return NextResponse.json({ error: "Invalid TaskLine filter column." }, { status: 400 });
    }

    const records = await loadTaskLineRecords(admin, organisation.organisationId, access);

    if (records.error) {
      return NextResponse.json({ error: records.error.message }, { status: 500 });
    }

    const values = Array.from(
      new Set((records.data ?? []).map((record) => text(formatRecord(record)[column])))
    ).sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));

    return NextResponse.json({ column, values });
  }

  const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);

  if (Number.isInteger(requestedLimit) && requestedLimit > 0) {
    const offset = Math.max(0, Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(requestedLimit, maxTaskLineWindowSize);
    const query = parseTaskLineQuery(searchParams);

    if (hasTaskLineQuery(query)) {
      const records = await loadTaskLineRecords(admin, organisation.organisationId, access);

      if (records.error) {
        return NextResponse.json({ error: records.error.message }, { status: 500 });
      }

      const matchingRows = filterAndSortTaskLineRows((records.data ?? []).map(formatRecord), query);
      return NextResponse.json({
        limit,
        offset,
        rows: matchingRows.slice(offset, offset + limit),
        total: matchingRows.length
      });
    }

    const records = await loadTaskLineRecordWindow(admin, organisation.organisationId, access, offset, limit);

    if (records.error) {
      return NextResponse.json({ error: records.error.message }, { status: 500 });
    }

    return NextResponse.json({
      limit,
      offset,
      rows: (records.data ?? []).map(formatRecord),
      total: records.count ?? 0
    });
  }

  const records = await loadTaskLineRecords(admin, organisation.organisationId, access);

  if (records.error) {
    return NextResponse.json({ error: records.error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: (records.data ?? []).map(formatRecord)
  });
}

function parseTaskLineQuery(searchParams: URLSearchParams): TaskLineQuery {
  const allowedColumns = new Set(taskLineColumns);
  const rawSortKey = text(searchParams.get("sortKey"));
  const rawSortDir = searchParams.get("sortDir");

  return {
    columnFilters: parseStringRecord(searchParams.get("columnFilters"), allowedColumns),
    dueColorFilter: parseStringArray(searchParams.get("dueColors")),
    search: text(searchParams.get("q")),
    sortState: allowedColumns.has(rawSortKey) && (rawSortDir === "asc" || rawSortDir === "desc")
      ? { dir: rawSortDir, key: rawSortKey }
      : null,
    statusFilter: text(searchParams.get("status")),
    valueFilters: parseStringArrayRecord(searchParams.get("valueFilters"), allowedColumns)
  };
}

function hasTaskLineQuery(query: TaskLineQuery) {
  return Boolean(
    query.search.trim() ||
    query.statusFilter ||
    query.sortState ||
    query.dueColorFilter.length ||
    Object.values(query.columnFilters).some((value) => value.trim()) ||
    Object.values(query.valueFilters).some((values) => values.length)
  );
}

function parseStringRecord(raw: string | null, allowedKeys: Set<string>) {
  const result: Record<string, string> = {};
  const parsed = parseJsonObject(raw);

  for (const [key, value] of Object.entries(parsed)) {
    if (allowedKeys.has(key) && typeof value === "string" && value.trim()) {
      result[key] = value;
    }
  }

  return result;
}

function parseStringArrayRecord(raw: string | null, allowedKeys: Set<string>) {
  const result: Record<string, string[]> = {};
  const parsed = parseJsonObject(raw);

  for (const [key, value] of Object.entries(parsed)) {
    if (!allowedKeys.has(key) || !Array.isArray(value)) {
      continue;
    }

    const values = value.filter((item): item is string => typeof item === "string");
    if (values.length) {
      result[key] = values;
    }
  }

  return result;
}

function parseStringArray(raw: string | null) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function filterAndSortTaskLineRows(sourceRows: TaskLineRow[], query: TaskLineQuery) {
  const search = query.search.trim().toLowerCase();
  const result = sourceRows.filter((row) => {
    const matchesSearch = !search || taskLineColumns.some((column) => text(row[column]).toLowerCase().includes(search));
    const matchesStatus = !query.statusFilter || text(row.status_open_close) === query.statusFilter;
    const matchesColumns = Object.entries(query.columnFilters).every(([key, value]) =>
      text(row[key]).toLowerCase().includes(value.trim().toLowerCase())
    );
    const matchesValues = Object.entries(query.valueFilters).every(([key, values]) => values.includes(text(row[key])));
    const matchesDueColor = !query.dueColorFilter.length || query.dueColorFilter.includes(taskLineDueDateCategory(text(row.due_date)));
    return matchesSearch && matchesStatus && matchesColumns && matchesValues && matchesDueColor;
  });

  if (!query.sortState) {
    return result;
  }

  const factor = query.sortState.dir === "asc" ? 1 : -1;
  const sortKey = query.sortState.key;
  return [...result].sort((first, second) => {
    const rawA = text(first[sortKey]);
    const rawB = text(second[sortKey]);

    if (taskLineDateColumns.has(sortKey)) {
      const dateA = parseDisplayDate(normalizeDisplayDate(rawA));
      const dateB = parseDisplayDate(normalizeDisplayDate(rawB));
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return factor * (dateA.getTime() - dateB.getTime());
    }

    if (taskLineNumberColumns.has(sortKey) || taskLineMoneyColumns.has(sortKey)) {
      const numA = rawA === "" ? Number.NaN : Number(rawA.replace(/[^0-9.-]/g, ""));
      const numB = rawB === "" ? Number.NaN : Number(rawB.replace(/[^0-9.-]/g, ""));
      const validA = !Number.isNaN(numA);
      const validB = !Number.isNaN(numB);
      if (!validA && !validB) return 0;
      if (!validA) return 1;
      if (!validB) return -1;
      return factor * (numA - numB);
    }

    return factor * rawA.localeCompare(rawB, undefined, { numeric: true });
  });
}

function taskLineDueDateCategory(value: string) {
  const due = parseDisplayDate(normalizeDisplayDate(value));
  if (!due) return "none";

  const todayKey = indiaDateKey(0);
  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 7) return "d7";
  if (diffDays <= 15) return "d15";
  if (diffDays <= 30) return "d30";
  if (diffDays <= 90) return "d90";
  return "none";
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    console.error("TaskLine POST error:", error);
    return NextResponse.json({ error: `TaskLine request failed: ${errorMessage(error)}` }, { status: 500 });
  }
}

async function handlePost(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  if (isViewOnlyRegisterUser(auth.user)) {
    return viewOnlyRegisterResponse("TaskLine");
  }

  const payload = (await request.json()) as {
    action?: "bulk_delete" | "import" | "save";
    importRows?: TaskLineImportRow[];
    record?: TaskLineRow;
    recordIds?: string[];
    returnRows?: boolean;
  };
  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);

  if ("error" in organisation) {
    return organisation.error;
  }
  const access = getAccess(auth.user);

  if (!access.canViewAll && !access.team) {
    return NextResponse.json({ error: "Your profile does not have a team assigned for TaskLine access." }, { status: 403 });
  }

  if (payload.action === "import") {
    return importRows(admin, organisation.organisationId, auth.user, access, payload.importRows ?? [], payload.returnRows !== false);
  }

  if (payload.action === "bulk_delete") {
    return bulkDeleteRows(admin, organisation.organisationId, auth.user, access, payload.recordIds ?? []);
  }

  const record = payload.record;

  if (!record) {
    return NextResponse.json({ error: "TaskLine record is required." }, { status: 400 });
  }

  const rawId = text(record.__id);
  const existingId = isUuid(rawId) ? rawId : "";
  const cleaned = applyTeamAccess(cleanRecord(record), access);
  const values = toTaskValues(cleaned);

  if (existingId) {
    const existing = await admin
      .from("tasks")
      .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
      .eq("id", existingId)
      .eq("organisation_id", organisation.organisationId)
      .maybeSingle();

    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 });
    }

    if (existing.data && isTaskLineRecord(existing.data as TaskRecord) && canAccessRecord(existing.data as TaskRecord, access)) {
      const saved = await admin
        .from("tasks")
        .update({
          ...values,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingId)
        .eq("organisation_id", organisation.organisationId)
        .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
        .single();

      if (saved.error) {
        return NextResponse.json({ error: saved.error.message }, { status: 500 });
      }

      await writeAuditLog(
        admin,
        organisation.organisationId,
        auth.user.id,
        "taskline.update",
        auditValue(existing.data as TaskRecord),
        auditValue(saved.data as TaskRecord)
      );

      // Allocation email: when the Resource changes, notify the newly
      // allocated resource (and only the resource).
      const previousResource = text((existing.data as TaskRecord).custom_values?.taskline_data?.resource);
      if (resourceAllocationChanged(previousResource, text(cleaned.resource))) {
        await sendResourceAllocationMail(admin, organisation.organisationId, saved.data as TaskRecord);
      }

      return NextResponse.json({ record: formatRecord(saved.data as TaskRecord) });
    } else if (existing.data) {
      return NextResponse.json({ error: "You can only update TaskLine rows for your own team." }, { status: 403 });
    }
  }

  let taskCode = "";
  try {
    const fyMonth = taskLineFyMonth(new Date());
    const { data: seq, error: seqError } = await admin.rpc("next_taskline_code_seq", {
      p_fy_month: fyMonth,
      p_org: organisation.organisationId
    });
    if (!seqError && typeof seq === "number") {
      taskCode = `W${fyMonth}-${String(seq).padStart(3, "0")}`;
    }
  } catch {
    // Task code is optional until database/016_taskline_task_code.sql is applied.
  }

  const insertValues = taskCode ? toTaskValues({ ...cleaned, task_code: taskCode }) : values;
  const saved = await admin
    .from("tasks")
    .insert({
      ...insertValues,
      created_by: null,
      organisation_id: organisation.organisationId,
      priority: "normal"
    })
    .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
    .single();

  if (saved.error) {
    return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }

  await writeAuditLog(admin, organisation.organisationId, auth.user.id, "taskline.create", null, auditValue(saved.data as TaskRecord));

  // Allocation email: a brand-new row created with a Resource selected
  // notifies that resource straight away.
  if (text(cleaned.resource)) {
    await sendResourceAllocationMail(admin, organisation.organisationId, saved.data as TaskRecord);
  }

  return NextResponse.json({ record: formatRecord(saved.data as TaskRecord) });
}

export async function DELETE(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  if (isViewOnlyRegisterUser(auth.user)) {
    return viewOnlyRegisterResponse("TaskLine");
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "TaskLine record id is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);

  if ("error" in organisation) {
    return organisation.error;
  }
  const access = getAccess(auth.user);

  const existing = await admin
    .from("tasks")
    .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
    .eq("id", id)
    .eq("organisation_id", organisation.organisationId)
    .single();

  if (existing.error || !isTaskLineRecord(existing.data as TaskRecord | null)) {
    return NextResponse.json({ error: existing.error?.message ?? "TaskLine record not found." }, { status: 404 });
  }

  if (!canAccessRecord(existing.data as TaskRecord, access)) {
    return NextResponse.json({ error: "You can only delete TaskLine rows for your own team." }, { status: 403 });
  }

  const deleted = await admin.from("tasks").delete().eq("id", id).eq("organisation_id", organisation.organisationId);

  if (deleted.error) {
    return NextResponse.json({ error: deleted.error.message }, { status: 500 });
  }

  await writeAuditLog(admin, organisation.organisationId, auth.user.id, "taskline.delete", auditValue(existing.data as TaskRecord), null);
  return NextResponse.json({ ok: true });
}

async function bulkDeleteRows(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  user: User,
  access: AccessScope,
  rawRecordIds: string[]
) {
  const recordIds = Array.from(new Set(rawRecordIds.map(text).filter(Boolean)));
  if (!recordIds.length || recordIds.length > 10) {
    return NextResponse.json({ error: "Select between 1 and 10 TaskLine tasks to delete." }, { status: 400 });
  }

  const existing = await admin
    .from("tasks")
    .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
    .eq("organisation_id", organisationId)
    .in("id", recordIds);
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  const records = ((existing.data ?? []) as TaskRecord[]).filter(
    (record) => isTaskLineRecord(record) && canAccessRecord(record, access)
  );
  if (records.length !== recordIds.length) {
    return NextResponse.json({ error: "One or more selected tasks are unavailable or outside your team access." }, { status: 403 });
  }

  const deleted = await admin.from("tasks").delete().eq("organisation_id", organisationId).in("id", recordIds);
  if (deleted.error) {
    return NextResponse.json({ error: deleted.error.message }, { status: 500 });
  }

  await writeAuditLog(admin, organisationId, user.id, "taskline.bulk_delete", records.map(auditValue), { deleted: records.length });
  return NextResponse.json({ deleted: records.length });
}

async function importRows(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  user: User,
  access: AccessScope,
  rows: TaskLineImportRow[],
  returnRows: boolean
) {
  const actionableRows = rows.map((row) => ({
    action: text(row.import_action || "Add").toLowerCase(),
    row,
    targetId: text(row.target_id)
  }));
  const needsSerialFallback = actionableRows.some(
    ({ action, targetId }) => (action === "update" || action === "delete") && !targetId
  );
  let existingRows: TaskRecord[] = [];

  if (needsSerialFallback) {
    const existing = await loadTaskLineRecords(admin, organisationId, access);
    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 });
    }
    existingRows = existing.data ?? [];
  }

  for (const item of actionableRows) {
    if (item.targetId || (item.action !== "update" && item.action !== "delete")) {
      continue;
    }
    const serialIndex = Number.parseInt(text(item.row.serial_no), 10) - 1;
    item.targetId = Number.isInteger(serialIndex) && serialIndex >= 0 ? text(existingRows[serialIndex]?.id) : "";
  }

  const requestedTargetIds = Array.from(
    new Set(actionableRows.map(({ targetId }) => targetId).filter(Boolean))
  );
  const accessibleTargetIds = new Set<string>();
  if (requestedTargetIds.length) {
    const targets = await admin
      .from("tasks")
      .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
      .eq("organisation_id", organisationId)
      .in("id", requestedTargetIds);
    if (targets.error) {
      return NextResponse.json({ error: targets.error.message }, { status: 500 });
    }
    for (const record of (targets.data ?? []) as TaskRecord[]) {
      if (isTaskLineRecord(record) && canAccessRecord(record, access)) {
        accessibleTargetIds.add(record.id);
      }
    }
  }

  const deleteIds = Array.from(
    new Set(
      actionableRows
        .filter(({ action, targetId }) => action === "delete" && accessibleTargetIds.has(targetId))
        .map(({ targetId }) => targetId)
    )
  );
  const updates = actionableRows.filter(
    ({ action, targetId }) => action === "update" && accessibleTargetIds.has(targetId)
  );
  const inserts = actionableRows
    .filter(({ action, row }) => action === "add" && hasValue(row))
    .map(({ row }) => {
      const cleaned = applyTeamAccess(cleanRecord(row), access);
      return {
        ...toTaskValues(cleaned),
        created_by: null,
        organisation_id: organisationId,
        priority: "normal"
      };
    });

  const deleteRequest = deleteIds.length
    ? admin.from("tasks").delete().eq("organisation_id", organisationId).in("id", deleteIds)
    : Promise.resolve({ error: null });
  const insertRequest = inserts.length
    ? admin.from("tasks").insert(inserts)
    : Promise.resolve({ error: null });
  const [deleteResult, insertResult] = await Promise.all([deleteRequest, insertRequest]);
  if (deleteResult.error) {
    return NextResponse.json({ error: deleteResult.error.message }, { status: 500 });
  }
  if (insertResult.error) {
    return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
  }

  for (let index = 0; index < updates.length; index += 25) {
    const updateResults = await Promise.all(
      updates.slice(index, index + 25).map(({ row, targetId }) => {
        const cleaned = applyTeamAccess(cleanRecord(row), access);
        return admin
          .from("tasks")
          .update({ ...toTaskValues(cleaned), updated_at: new Date().toISOString() })
          .eq("id", targetId)
          .eq("organisation_id", organisationId);
      })
    );
    const failedUpdate = updateResults.find((result) => result.error);
    if (failedUpdate?.error) {
      return NextResponse.json({ error: failedUpdate.error.message }, { status: 500 });
    }
  }

  const added = inserts.length;
  const updated = updates.length;
  const deleted = deleteIds.length;

  await writeAuditLog(admin, organisationId, user.id, "taskline.import", null, { added, deleted, updated });

  if (!returnRows) {
    return NextResponse.json({
      summary: { added, deleted, updated }
    });
  }

  const refreshed = await loadTaskLineRecords(admin, organisationId, access);

  if (refreshed.error) {
    return NextResponse.json({ error: refreshed.error.message }, { status: 500 });
  }

  return NextResponse.json({
    summary: { added, deleted, updated },
    rows: (refreshed.data ?? []).map(formatRecord)
  });
}

async function loadTaskLineNotifications(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  user: User
) {
  const identity = taskNotificationIdentity(user);

  if (!identity.name) {
    return NextResponse.json({ notifications: [] as TaskNotification[] });
  }

  const tomorrowKey = indiaDateKey(1);
  const dayAfterTomorrowKey = indiaDateKey(2);
  const assignmentLookback = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [dueTasks, assignmentLogs] = await Promise.all([
    admin
      .from("tasks")
      .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
      .eq("organisation_id", organisationId)
      .eq("custom_values->>workline_module", moduleKey)
      .gte("due_at", `${tomorrowKey}T00:00:00.000Z`)
      .lt("due_at", `${dayAfterTomorrowKey}T00:00:00.000Z`)
      .order("due_at", { ascending: true }),
    admin
      .from("audit_logs")
      .select("id,action,entity_id,old_value,new_value,created_at,actor_user_id")
      .eq("organisation_id", organisationId)
      .eq("entity_type", "taskline_record")
      .in("action", ["taskline.create", "taskline.update"])
      .gte("created_at", assignmentLookback)
      .order("created_at", { ascending: false })
      .limit(500)
  ]);

  if (dueTasks.error) {
    return NextResponse.json({ error: dueTasks.error.message }, { status: 500 });
  }

  const candidateLogs = assignmentLogs.error
    ? []
    : ((assignmentLogs.data ?? []) as AuditLog[]).filter((log) => {
        const previous = taskLineAuditData(log.old_value);
        const next = taskLineAuditData(log.new_value);
        return taskIsAssignedTo(next, identity) && !taskIsAssignedTo(previous, identity);
      });
  const candidateIds = Array.from(new Set(candidateLogs.map((log) => text(log.entity_id) || readId(log.new_value) || "").filter(Boolean)));
  let currentAssignmentTasks: TaskRecord[] = [];

  if (candidateIds.length) {
    const currentTasks = await admin
      .from("tasks")
      .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
      .eq("organisation_id", organisationId)
      .eq("custom_values->>workline_module", moduleKey)
      .in("id", candidateIds);

    if (!currentTasks.error) {
      currentAssignmentTasks = (currentTasks.data ?? []) as TaskRecord[];
    }
  }

  const currentTasksById = new Map(currentAssignmentTasks.map((record) => [record.id, record]));
  const includedAssignmentTaskIds = new Set<string>();
  const assignedNotifications: TaskNotification[] = [];

  for (const log of candidateLogs) {
    const recordId = text(log.entity_id) || readId(log.new_value) || "";
    const record = currentTasksById.get(recordId);
    const row = record?.custom_values?.taskline_data ?? {};

    if (!record || includedAssignmentTaskIds.has(recordId) || !taskIsAssignedTo(row, identity) || taskLineIsClosed(row)) {
      continue;
    }

    includedAssignmentTaskIds.add(recordId);
    assignedNotifications.push({
      due_date: normalizeDisplayDate(row.due_date),
      entity: text(row.entity),
      id: `assigned:${log.id}`,
      kind: "assigned",
      occurred_at: log.created_at,
      task: text(row.task)
    });

    if (assignedNotifications.length >= 20) {
      break;
    }
  }

  const dueNotifications = ((dueTasks.data ?? []) as TaskRecord[])
    .filter((record) => {
      const row = record.custom_values?.taskline_data ?? {};
      return isTaskLineRecord(record) && taskIsAssignedTo(row, identity) && !taskLineIsClosed(row);
    })
    .map<TaskNotification>((record) => {
      const row = record.custom_values?.taskline_data ?? {};
      return {
        due_date: normalizeDisplayDate(row.due_date),
        entity: text(row.entity),
        id: `due:${record.id}:${tomorrowKey}`,
        kind: "due_tomorrow",
        occurred_at: `${tomorrowKey}T00:00:00.000Z`,
        task: text(row.task)
      };
    });

  return NextResponse.json({
    notifications: [...dueNotifications, ...assignedNotifications].slice(0, 40)
  });
}

async function loadCalendarEvents(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  user: User,
  access: AccessScope
) {
  const rows: TaskRecord[] = [];

  for (let from = 0; ; from += fetchBatchSize) {
    const to = from + fetchBatchSize - 1;
    const { data, error } = await admin
      .from("tasks")
      .select("id,custom_values")
      .eq("organisation_id", organisationId)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    rows.push(...((data ?? []) as TaskRecord[]).filter(isTaskLineRecord));

    if ((data ?? []).length < fetchBatchSize) {
      break;
    }
  }

  const fullName = normalizeName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email);
  const roleText = `${text(user.user_metadata?.role)} ${text(user.user_metadata?.designation)}`.toLowerCase();
  const isPartner = access.canViewAll || roleText.includes("partner") || roleText.includes("owner") || roleText.includes("admin");
  const isArticle = roleText.includes("article");
  const events: Array<{ due_date: string; entity: string; name: string; stage: string; task: string }> = [];

  for (const record of rows) {
    const data = record.custom_values?.taskline_data ?? {};
    const dueDate = normalizeDisplayDate(data.due_date);

    if (!dueDate) {
      continue;
    }

    let include = false;

    if (isPartner) {
      include = true;
    } else if (isArticle) {
      include = splitNames(data.resource).includes(fullName);
    } else {
      include = splitNames(data.name).includes(fullName);
    }

    if (!include) {
      continue;
    }

    events.push({
      due_date: dueDate,
      entity: text(data.entity),
      name: text(data.name),
      stage: text(data.stage),
      task: text(data.task)
    });
  }

  return NextResponse.json({ events });
}

const nameHonorifics = new Set(["ca", "cs", "cma", "adv", "advocate", "mr", "mrs", "ms", "dr", "shri", "smt", "sh"]);

function normalizeName(value: unknown) {
  const parts = text(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  while (parts.length > 1 && nameHonorifics.has(parts[0])) {
    parts.shift();
  }

  return parts.join(" ");
}

function splitNames(value: unknown) {
  return text(value)
    .split(/[,;/\n]+/)
    .map(normalizeName)
    .filter(Boolean);
}

function taskNotificationIdentity(user: User) {
  const roleText = `${text(user.user_metadata?.role)} ${text(user.user_metadata?.designation)}`.toLowerCase();
  return {
    field: roleText.includes("article") ? "resource" as const : "name" as const,
    name: normalizeName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email)
  };
}

function taskIsAssignedTo(row: TaskLineRow, identity: ReturnType<typeof taskNotificationIdentity>) {
  return Boolean(identity.name) && splitNames(row[identity.field]).includes(identity.name);
}

function taskLineAuditData(value: unknown): TaskLineRow {
  if (!value || typeof value !== "object") {
    return {};
  }

  const data = (value as { data?: unknown }).data;
  return data && typeof data === "object" ? data as TaskLineRow : {};
}

function taskLineIsClosed(row: TaskLineRow) {
  const status = text(row.status_open_close).toLowerCase();
  return status === "close" || status === "closed";
}

function indiaDateKey(dayOffset: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric"
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + dayOffset));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

async function loadTaskLineRecords(admin: ReturnType<typeof createAdminClient>, organisationId: string, access: AccessScope) {
  console.time("taskline:loadRecords:count");
  const countResult = await admin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("custom_values->>workline_module", moduleKey);
  console.timeEnd("taskline:loadRecords:count");

  if (countResult.error) {
    return { data: null, error: countResult.error };
  }

  const total = countResult.count ?? 0;
  const batchCount = Math.max(1, Math.ceil(total / fetchBatchSize));

  console.time(`taskline:loadRecords:fetch(${total} rows, ${batchCount} batches)`);
  const batchResults = await Promise.all(
    Array.from({ length: batchCount }, (_, index) => {
      const from = index * fetchBatchSize;
      return admin
        .from("tasks")
        .select("id,custom_values")
        .eq("organisation_id", organisationId)
        .eq("custom_values->>workline_module", moduleKey)
        .order("created_at", { ascending: true })
        .range(from, from + fetchBatchSize - 1);
    })
  );
  console.timeEnd(`taskline:loadRecords:fetch(${total} rows, ${batchCount} batches)`);

  const rows: TaskRecord[] = [];
  for (const { data, error } of batchResults) {
    if (error) {
      return { data: null, error };
    }
    rows.push(...((data ?? []) as TaskRecord[]).filter((record) => isTaskLineRecord(record) && canAccessRecord(record, access)));
  }

  return { data: rows, error: null };
}

async function loadTaskLineRecordWindow(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  access: AccessScope,
  offset: number,
  limit: number
) {
  let query = admin
    .from("tasks")
    .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at", { count: "exact" })
    .eq("organisation_id", organisationId)
    .eq("custom_values->>workline_module", moduleKey)
    .order("created_at", { ascending: true });

  if (!access.canViewAll) {
    const teamValues = taskLineTeamVariants(access.team);

    if (!teamValues.length) {
      return { count: 0, data: [] as TaskRecord[], error: null };
    }

    query = query.in("custom_values->taskline_data->>team", teamValues);
  }

  const { count, data, error } = await query.range(offset, offset + limit - 1);

  return {
    count: count ?? 0,
    data: ((data ?? []) as TaskRecord[]).filter((record) => isTaskLineRecord(record) && canAccessRecord(record, access)),
    error
  };
}

async function loadAuditLogs(admin: ReturnType<typeof createAdminClient>, organisationId: string, access: AccessScope) {
  const logs = await admin
    .from("audit_logs")
    .select("id,action,entity_id,old_value,new_value,created_at,actor_user_id")
    .eq("organisation_id", organisationId)
    .eq("entity_type", "taskline_record")
    .order("created_at", { ascending: false })
    .limit(500);

  if (logs.error) {
    return [];
  }

  const taskLineLogs = (logs.data ?? []) as AuditLog[];

  const visibleLogs = access.canViewAll
    ? taskLineLogs
    : !access.team
      ? []
      : taskLineLogs.filter(
          (log) => canAccessAuditValue(log.old_value, access) || canAccessAuditValue(log.new_value, access)
        );

  if (!visibleLogs.length) {
    return visibleLogs;
  }

  const actorNames = await loadActorNames(admin);

  return visibleLogs.map((log) => ({
    ...log,
    actor_name: (log.actor_user_id && actorNames.get(log.actor_user_id)) || ""
  }));
}

async function loadActorNames(admin: ReturnType<typeof createAdminClient>) {
  const names = new Map<string, string>();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });

    if (error || !data) {
      break;
    }

    for (const user of data.users) {
      const metadata = user.user_metadata ?? {};
      const name = String(metadata.full_name ?? metadata.name ?? "").trim() || user.email || "";
      names.set(user.id, name);
    }

    if (data.users.length < 1000) {
      break;
    }

    page += 1;
  }

  return names;
}

async function writeAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  userId: string,
  action: string,
  oldValue: unknown,
  newValue: unknown
) {
  const entityId = readId(newValue) || readId(oldValue) || null;

  await admin.from("audit_logs").insert({
    action,
    actor_user_id: userId,
    entity_id: entityId,
    entity_type: "taskline_record",
    new_value: newValue,
    old_value: oldValue,
    organisation_id: organisationId
  });
}

function taskLineFyMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  const fyCode = `${String(fyStart).slice(2)}${String(fyEnd).slice(2)}`;
  return `${fyCode}-${String(month).padStart(2, "0")}`;
}

function toTaskValues(row: TaskLineRow) {
  return {
    custom_values: {
      taskline_data: row,
      workline_module: moduleKey
    },
    description: text(row.remarks || row.issue) || null,
    due_at: toDateTime(row.due_date),
    title: text(row.task || row.name || row.entity || row.entity_group) || "TaskLine row"
  };
}

function auditValue(record: TaskRecord) {
  return {
    data: cleanRecord(record.custom_values?.taskline_data ?? {}),
    id: record.id
  };
}

function formatRecord(record: TaskRecord): TaskLineRow {
  return {
    __id: record.id,
    ...cleanRecord(record.custom_values?.taskline_data ?? {})
  };
}

function cleanRecord(record: TaskLineRow) {
  return taskLineColumns.reduce<TaskLineRow>((result, key) => {
    result[key] = taskLineDateColumns.has(key) ? normalizeDisplayDate(record[key]) : text(record[key]);
    return result;
  }, {});
}

function hasValue(row: TaskLineRow) {
  return taskLineColumns.some((key) => text(row[key]));
}

function applyTeamAccess(row: TaskLineRow, access: AccessScope) {
  if (access.canViewAll || !access.team) {
    return row;
  }

  return {
    ...row,
    team: access.team
  };
}

function canAccessRecord(record: TaskRecord, access: AccessScope) {
  return canAccessTaskLineRow(record.custom_values?.taskline_data ?? {}, access);
}

function canAccessAuditValue(value: unknown, access: AccessScope) {
  if (access.canViewAll) {
    return true;
  }

  if (!access.team) {
    return false;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const auditValue = value as { data?: TaskLineRow } & TaskLineRow;
  return canAccessTaskLineRow(auditValue.data ?? auditValue, access);
}

function canAccessTaskLineRow(row: TaskLineRow, access: AccessScope) {
  if (access.canViewAll) {
    return true;
  }

  if (!access.team) {
    return false;
  }

  return normalizeTeam(row.team) === normalizeTeam(access.team);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isTaskLineRecord(record: TaskRecord | null): record is TaskRecord {
  return record?.custom_values?.workline_module === moduleKey;
}

function readId(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeRecord = value as { id?: unknown };
  return text(maybeRecord.id) || null;
}

function toDateTime(value: unknown) {
  const raw = normalizeDisplayDate(value);

  if (!raw) {
    return null;
  }

  const parsed = parseDisplayDate(raw);
  return parsed ? parsed.toISOString() : null;
}

function normalizeDisplayDate(value: unknown) {
  const raw = text(value);

  if (!raw) {
    return "";
  }

  const dayMonthYear = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);

  if (dayMonthYear) {
    const day = Number(dayMonthYear[1]);
    const month = Number(dayMonthYear[2]);
    const year = Number(dayMonthYear[3].length === 2 ? `20${dayMonthYear[3]}` : dayMonthYear[3]);
    return formatDisplayDate(year, month, day);
  }

  const yearMonthDay = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (yearMonthDay) {
    return formatDisplayDate(Number(yearMonthDay[1]), Number(yearMonthDay[2]), Number(yearMonthDay[3]));
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 1900 || parsed.getUTCFullYear() > 2200) {
    return "";
  }

  return formatDisplayDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

function parseDisplayDate(value: string) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function formatDisplayDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "";
  }

  return `${pad2(day)}-${pad2(month)}-${year}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("TaskLine service is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function getAccess(user: User): AccessScope {
  const role = text(user.user_metadata?.role).toLowerCase();
  const team = text(user.user_metadata?.team);
  const canViewAll = role === "partner" || role.includes("partner") || role === "owner" || role === "admin";

  return {
    canViewAll,
    role,
    team
  };
}

async function getOrganisationId(admin: ReturnType<typeof createAdminClient>, user: User) {
  const cached = organisationIdCache.get(user.id);
  if (cached) {
    return { organisationId: cached };
  }

  const { data, error } = await admin
    .from("users")
    .select("organisation_id")
    .eq("id", user.id)
    .single();

  if (!error && data?.organisation_id) {
    organisationIdCache.set(user.id, data.organisation_id as string);
    return { organisationId: data.organisation_id as string };
  }

  const organisationCode = text(user.user_metadata?.organisation_id) || defaultOrganisationCode;
  const slug = organisationCode.toLowerCase();
  const existingOrganisation = await admin.from("organisations").select("id").eq("slug", slug).maybeSingle();

  if (existingOrganisation.error) {
    return { error: NextResponse.json({ error: existingOrganisation.error.message }, { status: 500 }) };
  }

  const organisationId = existingOrganisation.data?.id;

  if (!organisationId) {
    return { error: NextResponse.json({ error: "Could not prepare TaskLine workspace." }, { status: 500 }) };
  }

  await admin.from("users").upsert({
    email: user.email ?? "",
    full_name: text(user.user_metadata?.full_name) || null,
    id: user.id,
    organisation_id: organisationId,
    status: "active"
  });

  organisationIdCache.set(user.id, organisationId);
  return { organisationId };
}

async function requireUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        }
      }
    }
  );
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }

  return { user };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function taskLineTeamVariants(value: unknown) {
  const current = text(value);
  const digits = current.match(/\d+/)?.[0];

  if (!digits) {
    return current ? [current] : [];
  }

  const teamNumber = Number.parseInt(digits, 10);
  const padded = String(teamNumber).padStart(2, "0");

  return Array.from(new Set([
    current,
    `Team-${padded}`,
    `Team ${padded}`,
    `Team-${teamNumber}`,
    `Team ${teamNumber}`
  ]));
}

function normalizeTeam(value: unknown) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

// ---------------------------------------------------------------------------
// Resource allocation email
// ---------------------------------------------------------------------------

const allocationAppUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.worklineco.com").replace(/\/+$/, "");

function resourceAllocationChanged(previous: string, next: string) {
  if (!next.trim()) {
    return false;
  }
  return allocationNameList(previous) !== allocationNameList(next);
}

function allocationNameList(value: string) {
  return allocationSplitNames(value).sort().join("|");
}

function allocationSplitNames(value: unknown) {
  return text(value)
    .split(/[,;/\n]+/)
    .map(allocationNormalizeName)
    .filter(Boolean);
}

function allocationNormalizeName(value: unknown) {
  const honorifics = new Set(["ca", "cs", "cma", "adv", "advocate", "mr", "mrs", "ms", "dr", "shri", "smt", "sh"]);
  const parts = text(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  while (parts.length > 1 && honorifics.has(parts[0])) {
    parts.shift();
  }

  return parts.join(" ");
}

function allocationIsEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function allocationSmtpConfiguration() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const from = process.env.TASK_REMINDER_FROM_EMAIL ?? process.env.OTP_FROM_EMAIL ?? "";
  const userMatch = from.match(/<([^>]+)>/);
  const user = process.env.SMTP_USER ?? userMatch?.[1]?.trim() ?? (from.includes("@") ? from.trim() : undefined);
  const password = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, "");

  if (!host || !user || !password || !Number.isFinite(port)) {
    return { error: "Task allocation email is not configured." as const };
  }

  return {
    from: from || `WorkLine Co <${user}>`,
    host,
    password,
    port,
    user
  };
}

function allocationEscapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character] ?? character);
}

async function sendResourceAllocationMail(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  record: TaskRecord
) {
  try {
    const row = record.custom_values?.taskline_data ?? {};
    const resourceNames = allocationSplitNames(row.resource);

    if (!resourceNames.length) {
      return;
    }

    const smtp = allocationSmtpConfiguration();

    if ("error" in smtp) {
      console.error("TaskLine allocation email skipped:", smtp.error);
      return;
    }

    // Recipient emails come from the Team Members tab data: organisation
    // members joined with their auth profile (metadata name + login email).
    const members = await admin
      .from("users")
      .select("id,email,full_name,status")
      .eq("organisation_id", organisationId)
      .limit(2000);

    if (members.error) {
      console.error("TaskLine allocation email: could not load members:", members.error.message);
      return;
    }

    const authUsersById = new Map<string, User>();
    for (let page = 1; page <= 20; page += 1) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listed.error) {
        console.error("TaskLine allocation email: could not list auth users:", listed.error.message);
        break;
      }
      for (const user of listed.data.users) {
        authUsersById.set(user.id, user);
      }
      if (listed.data.users.length < 1000) {
        break;
      }
    }

    const recipients = new Set<string>();

    for (const member of members.data ?? []) {
      if (text(member.status).toLowerCase() === "inactive") {
        continue;
      }

      const user = authUsersById.get(member.id);
      const name = allocationNormalizeName(
        user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? member.full_name ?? user?.email
      );

      if (name && resourceNames.includes(name)) {
        const email = text(user?.email || member.email).toLowerCase();

        if (allocationIsEmail(email)) {
          recipients.add(email);
        }
      }
    }

    if (!recipients.size) {
      console.warn("TaskLine allocation email: no member email found for resource:", text(row.resource));
      return;
    }

    const transporter = createTransport({
      auth: {
        pass: smtp.password,
        user: smtp.user
      },
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465
    });

    const entity = text(row.entity) || "TaskLine task";
    const taskName = text(row.task) || "Task";
    const dueDate = text(row.due_date) || "Not set";
    const team = text(row.team) || "-";
    const stage = text(row.stage) || "-";
    const period = text(row.period) || "-";
    const allocatedBy = text(row.name) || "-";
    const subject = `New task allocated: ${entity} — ${taskName}`;
    const bodyText = [
      "NEW TASK ALLOCATED TO YOU",
      "",
      entity,
      `Task: ${taskName}`,
      `Team: ${team}`,
      `Stage: ${stage}`,
      `Period: ${period}`,
      `Manager: ${allocatedBy}`,
      `Due date: ${dueDate}`,
      "",
      `Open TaskLine: ${allocationAppUrl}/taskline`
    ].join("\n");
    const safeEntity = allocationEscapeHtml(entity);
    const safeTask = allocationEscapeHtml(taskName);
    const safeDueDate = allocationEscapeHtml(dueDate);
    const safeTeam = allocationEscapeHtml(team);
    const safeStage = allocationEscapeHtml(stage);
    const safePeriod = allocationEscapeHtml(period);
    const safeAllocatedBy = allocationEscapeHtml(allocatedBy);
    const bodyHtml = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;">${safeEntity} has been allocated to you.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fa;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="52" valign="top">
                      <div style="width:44px;height:44px;border-radius:14px;background:#dbeafe;color:#1d4ed8;text-align:center;line-height:44px;font-size:21px;">&#128203;</div>
                    </td>
                    <td style="padding-left:14px;">
                      <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.2px;color:#1d4ed8;">NEW TASK ALLOCATED TO YOU</div>
                      <div style="margin-top:6px;font-size:17px;line-height:24px;font-weight:700;color:#172033;">${safeEntity}</div>
                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:12px;font-size:14px;line-height:22px;">
                        <tr>
                          <td style="width:78px;color:#94a3b8;font-weight:600;">Task</td>
                          <td style="color:#475569;font-weight:600;">${safeTask}</td>
                        </tr>
                        <tr>
                          <td style="color:#94a3b8;font-weight:600;">Team</td>
                          <td style="color:#475569;font-weight:600;">${safeTeam}</td>
                        </tr>
                        <tr>
                          <td style="color:#94a3b8;font-weight:600;">Stage</td>
                          <td style="color:#475569;font-weight:600;">${safeStage}</td>
                        </tr>
                        <tr>
                          <td style="color:#94a3b8;font-weight:600;">Period</td>
                          <td style="color:#475569;font-weight:600;">${safePeriod}</td>
                        </tr>
                        <tr>
                          <td style="color:#94a3b8;font-weight:600;">Manager</td>
                          <td style="color:#475569;font-weight:600;">${safeAllocatedBy}</td>
                        </tr>
                        <tr>
                          <td style="color:#94a3b8;font-weight:600;">Due date</td>
                          <td style="color:#475569;font-weight:600;">${safeDueDate}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:22px;text-align:center;">
                  <a href="${allocationEscapeHtml(`${allocationAppUrl}/taskline`)}" style="display:inline-block;border-radius:10px;background:#1e3168;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;">Open TaskLine</a>
                </div>
              </td>
            </tr>
          </table>
          <div style="padding-top:12px;font-size:11px;line-height:18px;color:#94a3b8;">Automated notification from WorkLine Co</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    for (const recipient of recipients) {
      await transporter.sendMail({
        from: smtp.from,
        html: bodyHtml,
        subject,
        text: bodyText,
        to: recipient
      });

      const logged = await admin.from("audit_logs").insert({
        action: "taskline.allocation_email_sent",
        actor_user_id: null,
        entity_id: record.id,
        entity_type: "taskline_email_allocation",
        new_value: {
          recipient,
          resource: text(row.resource),
          sent_at: new Date().toISOString()
        },
        old_value: null,
        organisation_id: organisationId
      });

      if (logged.error) {
        console.error("Could not record TaskLine allocation email:", logged.error.message);
      }
    }
  } catch (error) {
    console.error("TaskLine allocation email failed:", error);
  }
}
