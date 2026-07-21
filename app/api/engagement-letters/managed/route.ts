import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type RegisterRow = Record<string, string | number>;
type ManagedRecord = {
  created_at?: string;
  custom_values: RegisterRow | null;
  id: string;
  name: string;
  updated_at?: string;
};

const activeSourceKey = "engagement_letters_register";
const trashSourceKey = "engagement_letters_trash";
const defaultOrganisationCode = "DCO1433";
const fetchBatchSize = 1000;
const columns = [
  "S.No.",
  "Client / Entity",
  "Service / Scope",
  "Period",
  "Engagement Date",
  "Fee",
  "Retainer Fee",
  "Billing Cycle",
  "Zoho Drive Link",
  "Billed Status",
  "Remarks"
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
  return loadResponse(admin, organisation.organisationId);
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }
  const payload = (await request.json()) as { action?: string; row?: RegisterRow; rowId?: string };
  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }
  const action = payload.action ?? "add";

  if (action === "add") {
    const row = normalizeIncomingRow(payload.row ?? {}, 0);
    const inserted = await admin
      .from("clients")
      .insert({
        created_by: auth.user.id,
        custom_values: { ...row, source: activeSourceKey },
        name: getRecordName(row),
        organisation_id: organisation.organisationId,
        status: "active"
      });
    if (inserted.error) {
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }
    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "engagement_letter.add", null, row);
    return loadResponse(admin, organisation.organisationId);
  }

  if (action === "update") {
    if (!payload.rowId) {
      return NextResponse.json({ error: "Row id is required." }, { status: 400 });
    }
    const row = normalizeIncomingRow(payload.row ?? {}, 0);
    const updated = await admin
      .from("clients")
      .update({
        custom_values: { ...row, source: activeSourceKey },
        name: getRecordName(row),
        updated_at: new Date().toISOString()
      })
      .eq("id", payload.rowId)
      .eq("organisation_id", organisation.organisationId)
      .eq("custom_values->>source", activeSourceKey);
    if (updated.error) {
      return NextResponse.json({ error: updated.error.message }, { status: 500 });
    }
    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "engagement_letter.edit", null, row);
    return loadResponse(admin, organisation.organisationId);
  }

  if (action === "delete") {
    if (!payload.rowId) {
      return NextResponse.json({ error: "Row id is required." }, { status: 400 });
    }
    const deleted = await admin
      .from("clients")
      .update({
        custom_values: { source: trashSourceKey, deleted_at: new Date().toISOString(), deleted_by: auth.user.id },
        status: "inactive",
        updated_at: new Date().toISOString()
      })
      .eq("id", payload.rowId)
      .eq("organisation_id", organisation.organisationId)
      .eq("custom_values->>source", activeSourceKey);
    if (deleted.error) {
      return NextResponse.json({ error: deleted.error.message }, { status: 500 });
    }
    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "engagement_letter.delete", { id: payload.rowId }, null);
    return loadResponse(admin, organisation.organisationId);
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}

async function loadResponse(admin: ReturnType<typeof createAdminClient>, organisationId: string) {
  const active = await fetchAllRows(admin, organisationId, activeSourceKey);
  if (active.error) {
    return NextResponse.json({ error: active.error.message }, { status: 500 });
  }
  return NextResponse.json({
    rows: (active.data ?? []).map((record, index) => normalizeRow(record, index))
  });
}

async function fetchAllRows(admin: ReturnType<typeof createAdminClient>, organisationId: string, source: string) {
  const rows: ManagedRecord[] = [];
  for (let from = 0; ; from += fetchBatchSize) {
    const to = from + fetchBatchSize - 1;
    const { data, error } = await admin
      .from("clients")
      .select("id,name,custom_values,created_at,updated_at")
      .eq("organisation_id", organisationId)
      .eq("custom_values->>source", source)
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) {
      return { data: null, error };
    }
    rows.push(...((data ?? []) as ManagedRecord[]));
    if ((data ?? []).length < fetchBatchSize) {
      return { data: rows, error: null };
    }
  }
}

async function writeAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  userId: string,
  action: string,
  oldValue: unknown,
  newValue: unknown
) {
  await admin.from("audit_logs").insert({
    action,
    actor_user_id: userId,
    entity_type: "engagement_letter_record",
    new_value: newValue,
    old_value: oldValue,
    organisation_id: organisationId
  });
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Engagement letters service is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function getOrganisationId(admin: ReturnType<typeof createAdminClient>, user: User) {
  const { data, error } = await admin.from("users").select("organisation_id").eq("id", user.id).single();
  if (!error && data?.organisation_id) {
    return { organisationId: data.organisation_id as string };
  }
  const organisationCode = String(user.user_metadata?.organisation_id ?? "").trim() || defaultOrganisationCode;
  const existingOrganisation = await admin
    .from("organisations")
    .select("id")
    .eq("slug", organisationCode.toLowerCase())
    .maybeSingle();
  if (existingOrganisation.error) {
    return { error: NextResponse.json({ error: existingOrganisation.error.message }, { status: 500 }) };
  }
  const organisationId = existingOrganisation.data?.id;
  if (!organisationId) {
    return { error: NextResponse.json({ error: "Could not resolve organisation." }, { status: 500 }) };
  }
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

function normalizeRow(record: ManagedRecord, index: number): RegisterRow {
  const customValues = record.custom_values ?? {};
  const row = columns.reduce<RegisterRow>((result, column) => {
    result[column] = column === "S.No." ? customValues[column] || index + 1 : customValues[column] || "";
    return result;
  }, {});
  row.id = record.id;
  row.created_at = record.created_at ?? "";
  row.updated_at = record.updated_at ?? "";
  return row;
}

function normalizeIncomingRow(row: RegisterRow, index: number): RegisterRow {
  return columns.reduce<RegisterRow>((record, column) => {
    record[column] = column === "S.No." ? row[column] || index + 1 : row[column] ?? "";
    return record;
  }, {});
}

function getRecordName(row: RegisterRow) {
  return String(row["Client / Entity"] ?? "").trim() || "Engagement letter";
}
