import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type TaskLineRow = Record<string, string>;
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
type AccessScope = {
  canViewAll: boolean;
  role: string;
  team: string;
};

const defaultOrganisationCode = "DCO1433";
const fetchBatchSize = 1000;
const moduleKey = "taskline";
const taskLineDateColumns = new Set(["due_date", "ref_date", "entry_date", "completion_date"]);
const taskLineColumns = [
  "team",
  "name",
  "resource",
  "entity_group",
  "entity",
  "state_name",
  "task",
  "due_date",
  "stage",
  "status_open_close",
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
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);

  if ("error" in organisation) {
    return organisation.error;
  }

  const access = getAccess(auth.user);

  if (new URL(request.url).searchParams.get("view") === "calendar") {
    return loadCalendarEvents(admin, organisation.organisationId, auth.user, access);
  }

  const [records, auditLogs] = await Promise.all([
    loadTaskLineRecords(admin, organisation.organisationId, access),
    loadAuditLogs(admin, organisation.organisationId, access)
  ]);

  if (records.error) {
    return NextResponse.json({ error: records.error.message }, { status: 500 });
  }

  return NextResponse.json({
    auditLogs,
    rows: (records.data ?? []).map(formatRecord)
  });
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

  const payload = (await request.json()) as {
    action?: "import" | "save";
    importRows?: Array<TaskLineRow & { import_action?: string; serial_no?: string }>;
    record?: TaskLineRow;
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

  const record = payload.record;

  if (!record) {
    return NextResponse.json({ error: "TaskLine record is required." }, { status: 400 });
  }

  const existingId = text(record.__id);
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
      return NextResponse.json({ record: formatRecord(saved.data as TaskRecord) });
    } else if (existing.data) {
      return NextResponse.json({ error: "You can only update TaskLine rows for your own team." }, { status: 403 });
    }
  }

  const saved = await admin
    .from("tasks")
    .insert({
      ...values,
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
  return NextResponse.json({ record: formatRecord(saved.data as TaskRecord) });
}

export async function DELETE(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
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

async function importRows(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  user: User,
  access: AccessScope,
  rows: Array<TaskLineRow & { import_action?: string; serial_no?: string }>,
  returnRows: boolean
) {
  const existing = await loadTaskLineRecords(admin, organisationId, access);

  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  const existingRows = existing.data ?? [];
  let added = 0;
  let updated = 0;
  let deleted = 0;

  for (const row of rows) {
    const action = text(row.import_action || "Add").toLowerCase();
    const serialIndex = Number.parseInt(text(row.serial_no), 10) - 1;
    const target = Number.isInteger(serialIndex) && serialIndex >= 0 ? existingRows[serialIndex] : null;

    if (action === "delete") {
      if (target?.id) {
        await admin.from("tasks").delete().eq("id", target.id).eq("organisation_id", organisationId);
        deleted += 1;
      }
      continue;
    }

    if (action === "update") {
      if (target?.id) {
        const cleaned = applyTeamAccess(cleanRecord(row), access);
        const updatedRow = await admin
          .from("tasks")
          .update({
            ...toTaskValues(cleaned),
            updated_at: new Date().toISOString()
          })
          .eq("id", target.id)
          .eq("organisation_id", organisationId)
          .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
          .single();

        if (updatedRow.error) {
          return NextResponse.json({ error: updatedRow.error.message }, { status: 500 });
        }

        updated += 1;
      }
      continue;
    }

    if (hasValue(row)) {
      const cleaned = applyTeamAccess(cleanRecord(row), access);
      const inserted = await admin.from("tasks").insert({
        ...toTaskValues(cleaned),
        created_by: null,
        organisation_id: organisationId,
        priority: "normal"
      });

      if (inserted.error) {
        return NextResponse.json({ error: inserted.error.message }, { status: 500 });
      }

      added += 1;
    }
  }

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
      .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: true })
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
  const events: Array<{ due_date: string; entity: string; status: string; task: string }> = [];

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
      status: text(data.status_open_close),
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

async function loadTaskLineRecords(admin: ReturnType<typeof createAdminClient>, organisationId: string, access: AccessScope) {
  const rows: TaskRecord[] = [];

  for (let from = 0; ; from += fetchBatchSize) {
    const to = from + fetchBatchSize - 1;
    const { data, error } = await admin
      .from("tasks")
      .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      return { data: null, error };
    }

    rows.push(...((data ?? []) as TaskRecord[]).filter((record) => isTaskLineRecord(record) && canAccessRecord(record, access)));

    if ((data ?? []).length < fetchBatchSize) {
      return { data: rows, error: null };
    }
  }
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
  const { data, error } = await admin
    .from("users")
    .select("organisation_id")
    .eq("id", user.id)
    .single();

  if (!error && data?.organisation_id) {
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

function normalizeTeam(value: unknown) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
