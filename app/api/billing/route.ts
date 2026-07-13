import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type BillingRecord = {
  amount?: number | string;
  billing_status?: string;
  cgst?: number | string;
  client?: string;
  cost_center?: string;
  description?: string;
  group_name?: string;
  gstin?: string;
  gstat_appeal_id?: string | null;
  id?: string;
  igst?: number | string;
  include_ope_in_fees?: string;
  income_head?: string;
  invoice_date?: string | null;
  invoice_no?: string;
  memo_date?: string | null;
  memo_no?: string;
  ope?: number | string;
  ope_remarks?: string;
  owner_team?: string;
  place_of_supply?: string;
  person_authorised?: string;
  poc_email?: string;
  poc_mobile?: string;
  poc_name?: string;
  receiving_date?: string | null;
  receiving_status?: string;
  registration_type?: string;
  remarks?: string;
  sgst?: number | string;
  source_module?: string;
  total?: number | string;
  version_no?: number;
  voucher_type?: string;
};
type StoredBillingRecord = Required<Omit<BillingRecord, "id" | "gstat_appeal_id" | "invoice_date" | "memo_date">> & {
  created_at: string;
  created_by: string | null;
  gstat_appeal_id: string | null;
  id: string;
  invoice_date: string | null;
  memo_date: string | null;
  organisation_code: string;
  organisation_id: string | null;
  updated_at: string;
  updated_by: string | null;
};
type GstatMatter = {
  data: Record<string, string | number>;
  id: string;
  row_number: number;
};
type AccessScope = {
  canManageMasters: boolean;
  canViewAll: boolean;
  role: string;
  team: string;
};

const defaultOrganisationCode = "DCO1433";
const tableName = "firm_billing_records";
const masterTableName = "firm_billing_master_options";
const masterTypes = ["cost_center", "voucher_type", "income_head", "group_name", "billing_status", "receiving_status"];
const gstStateByCode: Record<string, string> = {
  "01": "Jammu And Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Orissa",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra And Nagar Haveli & Daman And Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman And Nicobar",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Other Country"
};

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

  const access = getAccessScope(auth.user);
  const [records, matters, masters, auditLogs, trashRecords] = await Promise.all([
    loadBillingRecords(admin, organisation.organisationId, access),
    loadGstatMatters(admin, access),
    loadMasters(admin, organisation.organisationId),
    loadAuditLogs(admin, organisation.organisationId, access),
    loadTrashRecords(admin, organisation.organisationId, access)
  ]);

  if (records.error) {
    return NextResponse.json({ error: records.error.message }, { status: 500 });
  }

  if (matters.error) {
    return NextResponse.json({ error: matters.error.message }, { status: 500 });
  }

  return NextResponse.json({
    access,
    auditLogs,
    masters,
    matters: ((matters.data ?? []) as GstatMatter[]).map(formatMatter),
    records: records.data ?? [],
    trashRecords
  });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const payload = (await request.json()) as {
    action?: string;
    master?: { label?: string; option_type?: string };
    record?: BillingRecord;
    rows?: BillingRecord[];
    trashId?: string;
  };
  const action = payload.action ?? "save";
  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);

  if ("error" in organisation) {
    return organisation.error;
  }

  const access = getAccessScope(auth.user);

  if (action === "restore") {
    if (!payload.trashId) {
      return NextResponse.json({ error: "Trash record id is required." }, { status: 400 });
    }

    const trash = await admin
      .from("audit_logs")
      .select("id,entity_id,old_value")
      .eq("id", payload.trashId)
      .eq("organisation_id", organisation.organisationId)
      .eq("entity_type", "billing_record")
      .eq("action", "billing.delete")
      .single();

    if (trash.error) {
      return NextResponse.json({ error: trash.error.message }, { status: 404 });
    }

    const data = trash.data.old_value as BillingRecord;

    if (!canAccessRecord(data as StoredBillingRecord, access)) {
      return NextResponse.json({ error: "Not allowed to restore this billing row." }, { status: 403 });
    }

    const restored = await admin
      .from(tableName)
      .insert({
        ...data,
        id: data.id || trash.data.entity_id,
        organisation_id: organisation.organisationId,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id
      })
      .select("*")
      .single();

    if (restored.error) {
      return NextResponse.json({ error: restored.error.message }, { status: 500 });
    }

    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "billing.restore", null, restored.data);
    return loadResponse(admin, organisation.organisationId, access);
  }

  if (action === "import") {
    if (!Array.isArray(payload.rows)) {
      return NextResponse.json({ error: "Rows are required for billing import." }, { status: 400 });
    }

    const rows = payload.rows.map((row) =>
      cleanRecord(row, auth.user.id, organisation.organisationId, access)
    );
    let inserted = rows.length
      ? await admin.from(tableName).insert(rows).select("*")
      : { data: [], error: null };

    if (inserted.error && isMissingCompatibilityColumn(inserted.error)) {
      inserted = rows.length
        ? await admin.from(tableName).insert(rows.map(stripCompatibilityColumns)).select("*")
        : { data: [], error: null };
    }

    if (inserted.error) {
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }

    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "billing.import", null, {
      row_count: rows.length
    });
    return loadResponse(admin, organisation.organisationId, access);
  }

  if (action === "master") {
    if (!access.canManageMasters) {
      return NextResponse.json({ error: "Only accounts or partners can maintain billing masters." }, { status: 403 });
    }

    const optionType = text(payload.master?.option_type);
    const label = text(payload.master?.label);

    if (!masterTypes.includes(optionType) || !label) {
      return NextResponse.json({ error: "Valid master type and label are required." }, { status: 400 });
    }

    const saved = await admin.from(masterTableName).upsert({
      created_by: auth.user.id,
      label,
      option_type: optionType,
      organisation_code: defaultOrganisationCode,
      organisation_id: organisation.organisationId,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id
    });

    if (saved.error) {
      return NextResponse.json({ error: saved.error.message }, { status: 500 });
    }

    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "billing.master.add", null, {
      label,
      option_type: optionType
    });
    return loadResponse(admin, organisation.organisationId, access);
  }

  if (!payload.record) {
    return NextResponse.json({ error: "Billing record is required." }, { status: 400 });
  }

  const record = payload.record;
  const cleaned = cleanRecord(record, auth.user.id, organisation.organisationId, access);

  if (record.id) {
    const existing = await admin
      .from(tableName)
      .select("*")
      .eq("id", record.id)
      .eq("organisation_id", organisation.organisationId)
      .single();

    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 404 });
    }

    if (!canAccessRecord(existing.data as StoredBillingRecord, access)) {
      return NextResponse.json({ error: "Not allowed to update this billing row." }, { status: 403 });
    }

    if (record.version_no && Number(existing.data.version_no) !== Number(record.version_no)) {
      return NextResponse.json(
        { error: "This billing row changed since you opened it.", latest: existing.data },
        { status: 409 }
      );
    }

    let saved = await admin
      .from(tableName)
      .update({ ...cleaned, version_no: Number(existing.data.version_no ?? 1) + 1 })
      .eq("id", record.id)
      .eq("organisation_id", organisation.organisationId)
      .select("*")
      .single();

    if (saved.error && isMissingCompatibilityColumn(saved.error)) {
      saved = await admin
        .from(tableName)
        .update(stripCompatibilityColumns({ ...cleaned, version_no: Number(existing.data.version_no ?? 1) + 1 }))
        .eq("id", record.id)
        .eq("organisation_id", organisation.organisationId)
        .select("*")
        .single();
    }

    if (saved.error) {
      return NextResponse.json({ error: saved.error.message }, { status: 500 });
    }

    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "billing.update", existing.data, saved.data);
    return NextResponse.json({ record: saved.data });
  }

  let saved = await admin.from(tableName).insert(cleaned).select("*").single();

  if (saved.error && isMissingCompatibilityColumn(saved.error)) {
    saved = await admin.from(tableName).insert(stripCompatibilityColumns(cleaned)).select("*").single();
  }

  if (saved.error) {
    return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }

  await writeAuditLog(admin, organisation.organisationId, auth.user.id, "billing.create", null, saved.data);
  return NextResponse.json({ record: saved.data });
}

export async function DELETE(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Billing record id is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);

  if ("error" in organisation) {
    return organisation.error;
  }

  const access = getAccessScope(auth.user);
  const existing = await admin
    .from(tableName)
    .select("*")
    .eq("id", id)
    .eq("organisation_id", organisation.organisationId)
    .single();

  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 404 });
  }

  if (!canAccessRecord(existing.data as StoredBillingRecord, access)) {
    return NextResponse.json({ error: "Not allowed to delete this billing row." }, { status: 403 });
  }

  const deleted = await admin.from(tableName).delete().eq("id", id).eq("organisation_id", organisation.organisationId);

  if (deleted.error) {
    return NextResponse.json({ error: deleted.error.message }, { status: 500 });
  }

  await writeAuditLog(admin, organisation.organisationId, auth.user.id, "billing.delete", existing.data, null);
  return NextResponse.json({ ok: true });
}

async function loadResponse(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  access: AccessScope
) {
  const [records, matters, masters, auditLogs, trashRecords] = await Promise.all([
    loadBillingRecords(admin, organisationId, access),
    loadGstatMatters(admin, access),
    loadMasters(admin, organisationId),
    loadAuditLogs(admin, organisationId, access),
    loadTrashRecords(admin, organisationId, access)
  ]);

  if (records.error) {
    return NextResponse.json({ error: records.error.message }, { status: 500 });
  }

  if (matters.error) {
    return NextResponse.json({ error: matters.error.message }, { status: 500 });
  }

  return NextResponse.json({
    access,
    auditLogs,
    masters,
    matters: ((matters.data ?? []) as GstatMatter[]).map(formatMatter),
    records: records.data ?? [],
    trashRecords
  });
}

function loadBillingRecords(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  access: AccessScope
) {
  let query = admin
    .from(tableName)
    .select("*")
    .eq("organisation_id", organisationId)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!access.canViewAll && access.team) {
    query = query.eq("owner_team", access.team);
  }

  return query;
}

function loadGstatMatters(admin: ReturnType<typeof createAdminClient>, access: AccessScope) {
  let query = admin
    .from("gstat_appeals")
    .select("id,row_number,data")
    .eq("organisation_code", defaultOrganisationCode)
    .order("row_number", { ascending: true });

  if (!access.canViewAll && access.team) {
    query = query.eq("data->>Person handling", access.team);
  }

  return query;
}

async function loadMasters(admin: ReturnType<typeof createAdminClient>, organisationId: string) {
  const { data } = await admin
    .from(masterTableName)
    .select("option_type,label")
    .eq("organisation_id", organisationId)
    .eq("is_active", true)
    .order("option_type", { ascending: true })
    .order("label", { ascending: true });

  return masterTypes.reduce<Record<string, string[]>>((masters, optionType) => {
    masters[optionType] = Array.from(
      new Set((data ?? []).filter((option) => option.option_type === optionType).map((option) => option.label as string))
    );
    return masters;
  }, {});
}

async function loadAuditLogs(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  access: AccessScope
) {
  const { data } = await admin
    .from("audit_logs")
    .select("id,action,actor_user_id,entity_id,old_value,new_value,created_at")
    .eq("organisation_id", organisationId)
    .eq("entity_type", "billing_record")
    .order("created_at", { ascending: false })
    .limit(150);

  const logs = await attachActorNames(admin, data ?? []);

  if (access.canViewAll || !access.team) {
    return logs;
  }

  return logs.filter((log) => {
    const oldTeam = readTeam(log.old_value);
    const newTeam = readTeam(log.new_value);
    return oldTeam === access.team || newTeam === access.team;
  });
}

async function attachActorNames<T extends { actor_user_id?: unknown }>(
  admin: ReturnType<typeof createAdminClient>,
  logs: T[]
) {
  const actorIds = Array.from(new Set(logs.map((log) => text(log.actor_user_id)).filter(Boolean)));

  if (!actorIds.length) {
    return logs.map((log) => ({ ...log, actor_name: null }));
  }

  const { data } = await admin
    .from("users")
    .select("id,full_name,email")
    .in("id", actorIds);
  const namesById = new Map(
    (data ?? []).map((user) => [
      String(user.id),
      text(user.full_name) || text(user.email) || "Unknown user"
    ])
  );

  return logs.map((log) => ({
    ...log,
    actor_name: namesById.get(text(log.actor_user_id)) ?? "Unknown user"
  }));
}

async function loadTrashRecords(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  access: AccessScope
) {
  const { data, error } = await admin
    .from("audit_logs")
    .select("id,action,actor_user_id,entity_id,old_value,new_value,created_at")
    .eq("organisation_id", organisationId)
    .eq("entity_type", "billing_record")
    .in("action", ["billing.delete", "billing.restore"])
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return [];
  }

  const restoredIds = new Set(
    (data ?? [])
      .filter((log) => log.action === "billing.restore")
      .map((log) => String(log.entity_id ?? readId(log.new_value)))
      .filter(Boolean)
  );
  const rows = (data ?? [])
    .filter((log) => log.action === "billing.delete")
    .filter((log) => !restoredIds.has(String(log.entity_id ?? "")))
    .map((log) => {
      const deletedAt = new Date(log.created_at);
      const expiresAt = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

      return {
        data: log.old_value,
        delete_action: "delete",
        deleted_at: log.created_at,
        deleted_by: log.actor_user_id,
        expires_at: expiresAt.toISOString(),
        id: log.id,
        original_billing_id: log.entity_id
      };
    });

  if (access.canViewAll || !access.team) {
    return rows;
  }

  return rows.filter((row) => readTeam(row.data) === access.team);
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
    entity_type: "billing_record",
    new_value: newValue,
    old_value: oldValue,
    organisation_id: organisationId
  });
}

function cleanRecord(record: BillingRecord, userId: string, organisationId: string, access: AccessScope) {
  const amount = toNumber(record.amount);
  const ope = toNumber(record.ope);
  const includeOpeInFees = yesNo(record.include_ope_in_fees);
  const placeOfSupply = text(record.place_of_supply) || stateFromGstin(record.gstin);
  const tax = calculateTax(getTaxBase(amount, ope, includeOpeInFees), placeOfSupply);
  const cgst = tax.cgst;
  const sgst = tax.sgst;
  const igst = tax.igst;
  const total = amount + cgst + sgst + igst + ope;
  const ownerTeam = access.canViewAll ? text(record.owner_team) || access.team : access.team;
  const linkedMatterId = text(record.gstat_appeal_id);

  return {
    amount,
    billing_status: text(record.billing_status) || "Draft",
    cgst,
    client: text(record.client),
    cost_center: text(record.cost_center),
    description: text(record.description),
    group_name: text(record.group_name),
    gstin: text(record.gstin),
    gstat_appeal_id: linkedMatterId || null,
    igst,
    include_ope_in_fees: includeOpeInFees,
    income_head: text(record.income_head),
    invoice_date: dateOrNull(record.invoice_date),
    invoice_no: text(record.invoice_no),
    memo_date: dateOrNull(record.memo_date),
    memo_no: text(record.memo_no),
    ope,
    ope_remarks: text(record.ope_remarks),
    organisation_code: defaultOrganisationCode,
    organisation_id: organisationId,
    owner_team: ownerTeam,
    place_of_supply: placeOfSupply,
    person_authorised: text(record.person_authorised),
    poc_email: text(record.poc_email),
    poc_mobile: text(record.poc_mobile),
    poc_name: text(record.poc_name),
    receiving_date: dateOrNull(record.receiving_date),
    receiving_status: text(record.receiving_status) || "Pending",
    registration_type: text(record.registration_type),
    remarks: text(record.remarks),
    sgst,
    source_module: linkedMatterId ? "gstat" : text(record.source_module) || "manual",
    total,
    updated_at: new Date().toISOString(),
    updated_by: userId,
    voucher_type: text(record.voucher_type) || "Proforma Invoice",
    created_by: record.id ? undefined : userId
  };
}

function isMissingCompatibilityColumn(error: unknown) {
  const message = isRecord(error) ? String(error.message ?? "") : String(error ?? "");

  return ["include_ope_in_fees", "place_of_supply", "registration_type", "receiving_date"].some((column) =>
    message.includes(column)
  );
}

function stripCompatibilityColumns<T extends Record<string, unknown>>(record: T) {
  const {
    include_ope_in_fees: _includeOpeInFees,
    place_of_supply: _placeOfSupply,
    receiving_date: _receivingDate,
    registration_type: _registrationType,
    ...compatibleRecord
  } = record;

  return compatibleRecord;
}

function formatMatter(matter: GstatMatter) {
  const data = matter.data ?? {};
  const entity = text(data["Entity Name"]);
  const appellant = text(data.Appellant);
  const team = text(data["Person handling"]);
  const oia = text(data["OIA No"]);
  const drc = text(data["DRC 07 No"]);

  return {
    client: entity || appellant,
    gstin: text(data.GSTIN),
    id: matter.id,
    label: [`#${matter.row_number}`, entity || appellant || "GSTAT matter", team, oia || drc].filter(Boolean).join(" - "),
    matter_description: text(data["Issue in brief"]) || text(data.Remark),
    owner_team: team,
    row_number: matter.row_number
  };
}

function canAccessRecord(record: StoredBillingRecord, access: AccessScope) {
  return access.canViewAll || !access.team || record.owner_team === access.team;
}

function getAccessScope(user: User): AccessScope {
  const role = text(user.user_metadata?.role).toLowerCase();
  const team = text(user.user_metadata?.team);
  const canViewAll = role === "partner" || role === "accounts" || role === "owner" || role === "admin";

  return {
    canManageMasters: canViewAll || role.includes("account"),
    canViewAll,
    role,
    team
  };
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Billing service is not configured.");
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
  const organisationName = organisationCode === defaultOrganisationCode ? "WorkLine DCO" : organisationCode;
  const existingOrganisation = await admin.from("organisations").select("id").eq("slug", slug).maybeSingle();

  if (existingOrganisation.error) {
    return { error: NextResponse.json({ error: existingOrganisation.error.message }, { status: 500 }) };
  }

  const organisationId =
    existingOrganisation.data?.id ?? (await createOrganisation(admin, organisationName, slug));

  if (!organisationId) {
    return { error: NextResponse.json({ error: "Could not prepare billing workspace." }, { status: 500 }) };
  }

  const { error: userError } = await admin.from("users").upsert({
    email: user.email ?? "",
    full_name: text(user.user_metadata?.full_name) || null,
    id: user.id,
    organisation_id: organisationId,
    status: "active"
  });

  if (userError) {
    return { error: NextResponse.json({ error: userError.message }, { status: 500 }) };
  }

  return { organisationId };
}

async function createOrganisation(admin: ReturnType<typeof createAdminClient>, name: string, slug: string) {
  const { data, error } = await admin
    .from("organisations")
    .insert({ name, slug, status: "trial" })
    .select("id")
    .single();

  if (error) {
    return null;
  }

  return data.id as string;
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

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOrNull(value: unknown) {
  const date = text(value);
  return date || null;
}

function stateFromGstin(value: unknown) {
  const code = text(value).slice(0, 2);
  return gstStateByCode[code] ?? "";
}

function calculateTax(amount: number, placeOfSupply: string) {
  if (placeOfSupply.trim().toLowerCase() === "rajasthan") {
    return {
      cgst: roundMoney(amount * 0.09),
      igst: 0,
      sgst: roundMoney(amount * 0.09)
    };
  }

  return {
    cgst: 0,
    igst: roundMoney(amount * 0.18),
    sgst: 0
  };
}

function getTaxBase(amount: number, ope: number, includeOpeInFees: string) {
  return includeOpeInFees === "Yes" ? amount + ope : amount;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function yesNo(value: unknown) {
  return text(value).toLowerCase() === "yes" ? "Yes" : "No";
}

function readId(value: unknown) {
  if (isRecord(value) && typeof value.id === "string") {
    return value.id;
  }

  return "";
}

function readTeam(value: unknown) {
  if (isRecord(value) && typeof value.owner_team === "string") {
    return value.owner_team;
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
