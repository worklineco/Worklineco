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

const defaultOrganisationCode = "DCO1433";
const fetchBatchSize = 1000;
const moduleKey = "taskline";
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

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);

  if ("error" in organisation) {
    return organisation.error;
  }

  const [records, auditLogs] = await Promise.all([
    loadTaskLineRecords(admin, organisation.organisationId),
    loadAuditLogs(admin, organisation.organisationId)
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
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const payload = (await request.json()) as {
    action?: "import" | "save";
    importRows?: Array<TaskLineRow & { import_action?: string; serial_no?: string }>;
    record?: TaskLineRow;
  };
  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);

  if ("error" in organisation) {
    return organisation.error;
  }

  if (payload.action === "import") {
    return importRows(admin, organisation.organisationId, auth.user, payload.importRows ?? []);
  }

  const record = payload.record;

  if (!record) {
    return NextResponse.json({ error: "TaskLine record is required." }, { status: 400 });
  }

  const existingId = text(record.__id);
  const cleaned = cleanRecord(record);
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

    if (existing.data && isTaskLineRecord(existing.data as TaskRecord)) {
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
    }
  }

  const saved = await admin
    .from("tasks")
    .insert({
      ...values,
      created_by: auth.user.id,
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

  const existing = await admin
    .from("tasks")
    .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
    .eq("id", id)
    .eq("organisation_id", organisation.organisationId)
    .single();

  if (existing.error || !isTaskLineRecord(existing.data as TaskRecord | null)) {
    return NextResponse.json({ error: existing.error?.message ?? "TaskLine record not found." }, { status: 404 });
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
  rows: Array<TaskLineRow & { import_action?: string; serial_no?: string }>
) {
  const existing = await loadTaskLineRecords(admin, organisationId);

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
        const updatedRow = await admin
          .from("tasks")
          .update({
            ...toTaskValues(cleanRecord(row)),
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
      const inserted = await admin.from("tasks").insert({
        ...toTaskValues(cleanRecord(row)),
        created_by: user.id,
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
  const refreshed = await loadTaskLineRecords(admin, organisationId);

  if (refreshed.error) {
    return NextResponse.json({ error: refreshed.error.message }, { status: 500 });
  }

  return NextResponse.json({
    summary: { added, deleted, updated },
    rows: (refreshed.data ?? []).map(formatRecord)
  });
}

async function loadTaskLineRecords(admin: ReturnType<typeof createAdminClient>, organisationId: string) {
  const rows: TaskRecord[] = [];

  for (let from = 0; ; from += fetchBatchSize) {
    const to = from + fetchBatchSize - 1;
    const { data, error } = await admin
      .from("tasks")
      .select("id,organisation_id,title,description,due_at,custom_values,created_by,created_at,updated_at")
      .eq("organisation_id", organisationId)
      .eq("custom_values->>workline_module", moduleKey)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      return { data: null, error };
    }

    rows.push(...((data ?? []) as TaskRecord[]).filter(isTaskLineRecord));

    if ((data ?? []).length < fetchBatchSize) {
      return { data: rows, error: null };
    }
  }
}

async function loadAuditLogs(admin: ReturnType<typeof createAdminClient>, organisationId: string) {
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

  return (logs.data ?? []) as AuditLog[];
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
    result[key] = text(record[key]);
    return result;
  }, {});
}

function hasValue(row: TaskLineRow) {
  return taskLineColumns.some((key) => text(row[key]));
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
  const raw = text(value);

  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
