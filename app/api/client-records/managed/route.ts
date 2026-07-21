import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type RegisterRow = Record<string, string | number>;
type ClientRecord = {
  created_at?: string;
  custom_values: RegisterRow | null;
  id: string;
  name: string;
  updated_at?: string;
};

const activeSourceKey = "client_records_register";
const trashSourceKey = "client_records_trash";
const defaultOrganisationCode = "DCO1433";
const fetchBatchSize = 1000;
const maxBulkDeleteRows = 5;
const importActionColumn = "Import Action";
const columns = [
  "S.no.",
  "Group",
  "Particulars",
  "Email ID",
  "POC Name",
  "POC Contact no.",
  "Address",
  "State",
  "Country",
  "Registration Type",
  "GSTIN/UIN",
  "PAN/IT No.",
  "Client Type",
  "Retainer Fee",
  "Billing Cycle"
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

  const payload = (await request.json()) as {
    action?: string;
    row?: RegisterRow;
    rowId?: string;
    rowIds?: string[];
    rows?: RegisterRow[];
  };
  const action = payload.action ?? "import";
  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);

  if ("error" in organisation) {
    return organisation.error;
  }

  if (action === "add") {
    const row = normalizeIncomingRow(payload.row ?? {}, 0);
    const inserted = await insertRows(admin, organisation.organisationId, auth.user.id, [row]);

    if (inserted.error) {
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }

    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "client_record.add", null, row);
    return loadResponse(admin, organisation.organisationId);
  }

  if (action === "update") {
    if (!payload.rowId) {
      return NextResponse.json({ error: "Row id is required." }, { status: 400 });
    }

    const existing = await admin
      .from("clients")
      .select("id,name,custom_values,created_at,updated_at")
      .eq("id", payload.rowId)
      .eq("organisation_id", organisation.organisationId)
      .eq("custom_values->>source", activeSourceKey)
      .single();

    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 });
    }

    const row = normalizeIncomingRow(payload.row ?? {}, 0);
    const updated = await admin
      .from("clients")
      .update({
        custom_values: { ...row, source: activeSourceKey },
        name: getClientName(row),
        updated_at: new Date().toISOString()
      })
      .eq("id", payload.rowId)
      .eq("organisation_id", organisation.organisationId);

    if (updated.error) {
      return NextResponse.json({ error: updated.error.message }, { status: 500 });
    }

    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "client_record.edit", existing.data?.custom_values ?? null, row);
    return loadResponse(admin, organisation.organisationId);
  }

  if (action === "delete") {
    const ids = Array.from(new Set((payload.rowIds ?? []).filter(Boolean)));

    if (!ids.length) {
      return NextResponse.json({ error: "Select at least one client record to delete." }, { status: 400 });
    }

    if (ids.length > maxBulkDeleteRows) {
      return NextResponse.json({ error: `You can delete at most ${maxBulkDeleteRows} client records at once.` }, { status: 400 });
    }

    const selected = await admin
      .from("clients")
      .select("id,name,custom_values,created_at,updated_at")
      .eq("organisation_id", organisation.organisationId)
      .eq("custom_values->>source", activeSourceKey)
      .in("id", ids);

    if (selected.error) {
      return NextResponse.json({ error: selected.error.message }, { status: 500 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const updates = await Promise.all(
      ((selected.data ?? []) as ClientRecord[]).map((row) =>
        admin
          .from("clients")
          .update({
            custom_values: {
              ...(row.custom_values ?? {}),
              deleted_at: now.toISOString(),
              deleted_by: auth.user.id,
              expires_at: expiresAt,
              source: trashSourceKey
            },
            status: "inactive",
            updated_at: now.toISOString()
          })
          .eq("id", row.id)
      )
    );
    const updateError = updates.find((update) => update.error)?.error;

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "client_record.delete", { row_count: selected.data?.length ?? 0 }, null);
    return loadResponse(admin, organisation.organisationId);
  }

  if (action === "restore") {
    const ids = Array.from(new Set((payload.rowIds ?? []).filter(Boolean)));

    if (!ids.length) {
      return NextResponse.json({ error: "Select at least one trash record to restore." }, { status: 400 });
    }

    const selected = await admin
      .from("clients")
      .select("id,name,custom_values,created_at,updated_at")
      .eq("organisation_id", organisation.organisationId)
      .eq("custom_values->>source", trashSourceKey)
      .in("id", ids);

    if (selected.error) {
      return NextResponse.json({ error: selected.error.message }, { status: 500 });
    }

    const updates = await Promise.all(
      ((selected.data ?? []) as ClientRecord[]).map((row) =>
        admin
          .from("clients")
          .update({
            custom_values: {
              ...(row.custom_values ?? {}),
              restored_at: new Date().toISOString(),
              restored_by: auth.user.id,
              source: activeSourceKey
            },
            status: "active",
            updated_at: new Date().toISOString()
          })
          .eq("id", row.id)
      )
    );
    const updateError = updates.find((update) => update.error)?.error;

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "client_record.restore", null, { row_count: selected.data?.length ?? 0 });
    return loadResponse(admin, organisation.organisationId);
  }

  if (action === "import") {
    if (!Array.isArray(payload.rows)) {
      return NextResponse.json({ error: "Rows are required." }, { status: 400 });
    }

    const activeRows = await loadClients(admin, organisation.organisationId, activeSourceKey, true);

    if (activeRows.error) {
      return NextResponse.json({ error: activeRows.error.message }, { status: 500 });
    }

    const existingRows = ((activeRows.data ?? []) as ClientRecord[]);
    const cleanedRows = payload.rows
      .map((row, index) => ({
        action: normalizeImportAction(row[importActionColumn]),
        row: normalizeIncomingRow(row, index)
      }))
      .filter((item) => columns.some((column) => column !== "S.no." && String(item.row[column] ?? "").trim()));
    const addRows = cleanedRows.filter((item) => item.action === "add").map((item) => item.row);
    const updateItems = cleanedRows.filter((item) => item.action === "update");
    const deleteItems = cleanedRows.filter((item) => item.action === "delete");
    const inserted = await insertRows(admin, organisation.organisationId, auth.user.id, addRows);

    if (inserted.error) {
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }

    const updateResults = await Promise.all(
      updateItems.map(async (item) => {
        const existing = findMatchingClientRecord(existingRows, item.row);

        if (!existing) {
          return { error: null, skipped: true };
        }

        const updated = await admin
          .from("clients")
          .update({
            custom_values: { ...item.row, source: activeSourceKey },
            name: getClientName(item.row),
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id)
          .eq("organisation_id", organisation.organisationId);

        return { error: updated.error, skipped: false };
      })
    );
    const updateError = updateResults.find((result) => result.error)?.error;

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const deleteMatches = deleteItems
      .map((item) => findMatchingClientRecord(existingRows, item.row))
      .filter((row): row is ClientRecord => Boolean(row));
    const deleteError = await moveClientRowsToTrash(admin, organisation.organisationId, auth.user.id, deleteMatches);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    await writeAuditLog(admin, organisation.organisationId, auth.user.id, "client_record.import", null, {
      added: addRows.length,
      deleted: deleteMatches.length,
      row_count: cleanedRows.length,
      updated: updateItems.length - updateResults.filter((result) => result.skipped).length
    });
    return loadResponse(admin, organisation.organisationId);
  }

  return NextResponse.json({ error: "Unsupported client records action." }, { status: 400 });
}

async function loadResponse(admin: ReturnType<typeof createAdminClient>, organisationId: string) {
  const [active, trash, audit] = await Promise.all([
    loadClients(admin, organisationId, activeSourceKey, true),
    loadClients(admin, organisationId, trashSourceKey, false),
    loadAuditLogs(admin, organisationId)
  ]);

  if (active.error) {
    return NextResponse.json({ error: active.error.message }, { status: 500 });
  }

  if (trash.error) {
    return NextResponse.json({ error: trash.error.message }, { status: 500 });
  }

  return NextResponse.json({
    auditLogs: audit,
    rows: (active.data ?? []).map((client, index) => normalizeClientRow(client, index)),
    trashRows: (trash.data ?? []).map((client, index) => normalizeClientRow(client, index))
  });
}

function insertRows(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  userId: string,
  rows: RegisterRow[]
) {
  const insertRows = rows.map((row) => ({
    created_by: userId,
    custom_values: {
      ...row,
      source: activeSourceKey
    },
    name: getClientName(row),
    organisation_id: organisationId,
    status: "active"
  }));

  return insertRows.length
    ? admin.from("clients").insert(insertRows).select("id,name,custom_values,created_at,updated_at")
    : { data: [], error: null };
}

async function moveClientRowsToTrash(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  userId: string,
  rows: ClientRecord[]
) {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values());

  if (!uniqueRows.length) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const updates = await Promise.all(
    uniqueRows.map((row) =>
      admin
        .from("clients")
        .update({
          custom_values: {
            ...(row.custom_values ?? {}),
            deleted_at: now.toISOString(),
            deleted_by: userId,
            expires_at: expiresAt,
            source: trashSourceKey
          },
          status: "inactive",
          updated_at: now.toISOString()
        })
        .eq("id", row.id)
        .eq("organisation_id", organisationId)
    )
  );

  return updates.find((update) => update.error)?.error ?? null;
}

function loadClients(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  source: string,
  ascending: boolean
) {
  return fetchAllClientRows(admin, organisationId, source, ascending);
}

async function fetchAllClientRows(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  source: string,
  ascending: boolean
) {
  const rows: ClientRecord[] = [];

  for (let from = 0; ; from += fetchBatchSize) {
    const to = from + fetchBatchSize - 1;
    const { data, error } = await admin
      .from("clients")
      .select("id,name,custom_values,created_at,updated_at")
      .eq("organisation_id", organisationId)
      .eq("custom_values->>source", source)
      .order("created_at", { ascending })
      .range(from, to);

    if (error) {
      return { data: null, error };
    }

    rows.push(...((data ?? []) as ClientRecord[]));

    if ((data ?? []).length < fetchBatchSize) {
      return { data: rows, error: null };
    }
  }
}

async function loadAuditLogs(admin: ReturnType<typeof createAdminClient>, organisationId: string) {
  const { data } = await admin
    .from("audit_logs")
    .select("id,action,actor_user_id,old_value,new_value,created_at")
    .eq("organisation_id", organisationId)
    .eq("entity_type", "client_record")
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
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
    entity_type: "client_record",
    new_value: newValue,
    old_value: oldValue,
    organisation_id: organisationId
  });
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Client records service is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function getOrganisationId(
  admin: ReturnType<typeof createAdminClient>,
  user: User
) {
  const { data, error } = await admin
    .from("users")
    .select("organisation_id")
    .eq("id", user.id)
    .single();

  if (!error && data?.organisation_id) {
    return { organisationId: data.organisation_id as string };
  }

  const organisationCode =
    String(user.user_metadata?.organisation_id ?? "").trim() || defaultOrganisationCode;
  const slug = organisationCode.toLowerCase();
  const organisationName = organisationCode === defaultOrganisationCode ? "WorkLine DCO" : organisationCode;
  const existingOrganisation = await admin
    .from("organisations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingOrganisation.error) {
    return {
      error: NextResponse.json(
        { error: existingOrganisation.error.message },
        { status: 500 }
      )
    };
  }

  const organisationId = existingOrganisation.data?.id ?? await createOrganisation(admin, organisationName, slug);

  if (!organisationId) {
    return {
      error: NextResponse.json(
        { error: "Could not prepare the firm workspace for client records." },
        { status: 500 }
      )
    };
  }

  const { error: userError } = await admin.from("users").upsert({
    email: user.email ?? "",
    full_name: String(user.user_metadata?.full_name ?? "").trim() || null,
    id: user.id,
    organisation_id: organisationId,
    status: "active"
  });

  if (userError) {
    return { error: NextResponse.json({ error: userError.message }, { status: 500 }) };
  }

  return { organisationId };
}

async function createOrganisation(
  admin: ReturnType<typeof createAdminClient>,
  name: string,
  slug: string
) {
  const { data, error } = await admin
    .from("organisations")
    .insert({
      name,
      slug,
      status: "trial"
    })
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

function normalizeClientRow(client: ClientRecord, index: number) {
  const customValues = client.custom_values ?? {};

  return columns.reduce<RegisterRow>((row, column) => {
    if (column === "S.no.") {
      row[column] = customValues[column] || customValues["Sl No."] || index + 1;
    } else if (column === "Particulars") {
      row[column] = customValues[column] || client.name || "";
    } else {
      row[column] = customValues[column] || "";
    }

    row.id = client.id;
    row.created_at = client.created_at ?? "";
    row.updated_at = client.updated_at ?? "";
    return row;
  }, {});
}

function normalizeIncomingRow(row: RegisterRow, index: number) {
  return columns.reduce<RegisterRow>((record, column) => {
    record[column] = column === "S.no." ? row[column] || row["Sl No."] || index + 1 : row[column] ?? "";
    return record;
  }, {});
}

function getClientName(row: RegisterRow) {
  return String(row.Particulars ?? "").trim() || `Client ${row["S.no."]}`;
}

function normalizeImportAction(value: unknown) {
  const action = String(value ?? "").trim().toLowerCase();

  if (action === "update") {
    return "update";
  }

  if (action === "delete") {
    return "delete";
  }

  return "add";
}

function findMatchingClientRecord(rows: ClientRecord[], incomingRow: RegisterRow) {
  const incomingId = normalizeLookupValue(incomingRow.id);

  if (incomingId) {
    const matchedById = rows.find((row) => normalizeLookupValue(row.id) === incomingId);

    if (matchedById) {
      return matchedById;
    }
  }

  const incomingGstin = normalizeLookupValue(incomingRow["GSTIN/UIN"]);
  const incomingPan = normalizeLookupValue(incomingRow["PAN/IT No."]);
  const incomingName = normalizeLookupValue(incomingRow.Particulars);

  return rows.find((row) => {
    const values = row.custom_values ?? {};
    return (
      (incomingGstin && normalizeLookupValue(values["GSTIN/UIN"]) === incomingGstin) ||
      (incomingPan && normalizeLookupValue(values["PAN/IT No."]) === incomingPan) ||
      (incomingName && normalizeLookupValue(values.Particulars) === incomingName)
    );
  }) ?? null;
}

function normalizeLookupValue(value: unknown) {
  return String(value ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();
}
