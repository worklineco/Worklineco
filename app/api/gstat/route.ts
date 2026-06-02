import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type AppealRow = {
  data: Record<string, string | number>;
  id?: string;
  row_number?: number;
};
type AccessScope = {
  isPartner: boolean;
  team: string;
};

const organisationCode = "DCO1433";

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const access = getAccessScope(auth.user);
  const { data, error } = await admin
    .from("gstat_appeals")
    .select("id,row_number,data,updated_at")
    .eq("organisation_code", organisationCode)
    .order("row_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: filterRowsForAccess(data ?? [], access) });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const {
    action = "import",
    rowIndex,
    rowIndexes,
    rows
  } = (await request.json()) as { action?: string; rowIndex?: number; rowIndexes?: number[]; rows?: AppealRow[] };
  const auditAction = ["import", "row_insert", "row_delete", "bulk_delete", "bulk_save"].includes(action)
    ? action
    : "bulk_save";

  const admin = createAdminClient();
  const access = getAccessScope(auth.user);
  const previous = await admin
    .from("gstat_appeals")
    .select("id,data,row_number")
    .eq("organisation_code", organisationCode);

  if (previous.error) {
    return NextResponse.json({ error: previous.error.message }, { status: 500 });
  }

  if (auditAction === "row_insert" || auditAction === "row_delete" || auditAction === "bulk_delete") {
    const existingRows = filterRowsForAccess(previous.data ?? [], access)
      .sort((first, second) => (first.row_number ?? 0) - (second.row_number ?? 0))
      .map((row) => ({ data: row.data ?? {}, row_number: row.row_number ?? 1 }));
    const selectedRowIndexes = new Set(
      (Array.isArray(rowIndexes) ? rowIndexes : []).filter((index) => Number.isInteger(index) && index >= 0)
    );
    const nextRows =
      auditAction === "row_insert"
        ? renumberRows([
            ...existingRows.slice(0, (rowIndex ?? -1) + 1),
            { data: {}, row_number: (rowIndex ?? -1) + 2 },
            ...existingRows.slice((rowIndex ?? -1) + 1)
          ])
        : auditAction === "bulk_delete"
          ? renumberRows(
              existingRows.length > selectedRowIndexes.size
                ? existingRows.filter((_, index) => !selectedRowIndexes.has(index))
                : [{ data: {}, row_number: 1 }]
            )
          : renumberRows(
            existingRows.length > 1
              ? existingRows.filter((_, index) => index !== rowIndex)
              : [{ data: {}, row_number: 1 }]
          );

    return replaceRows(admin, auth.user.id, nextRows, auditAction, previous.data?.length ?? 0, access);
  }

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Rows are required." }, { status: 400 });
  }

  const scopedRows = rows.map((row) => ({
    ...row,
    data: applyAccessToRowData(row.data ?? {}, access)
  }));

  return replaceRows(admin, auth.user.id, scopedRows, auditAction, previous.data?.length ?? 0, access);
}

async function replaceRows(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  rows: AppealRow[],
  auditAction: string,
  previousRowCount: number,
  access: AccessScope = { isPartner: true, team: "" }
) {
  let deleteQuery = admin
    .from("gstat_appeals")
    .delete()
    .eq("organisation_code", organisationCode);

  if (!access.isPartner && access.team) {
    deleteQuery = deleteQuery.eq("data->>Person handling", access.team);
  }

  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const insertRows = rows.map((row, index) => ({
    created_by: userId,
    data: { ...(row.data ?? {}), Sno: index + 1 },
    organisation_code: organisationCode,
    row_number: index + 1,
    updated_by: userId
  }));

  const inserted = insertRows.length
    ? await admin
        .from("gstat_appeals")
        .insert(insertRows)
        .select("id,row_number,data,updated_at")
    : { data: [], error: null };

  if (inserted.error) {
    return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  }

  await admin.from("gstat_audit_logs").insert({
    action: auditAction,
    actor_user_id: userId,
    field_name: auditAction,
    new_value: { row_count: rows.length },
    old_value: { row_count: previousRowCount },
    organisation_code: organisationCode
  });

  return NextResponse.json({ rows: filterRowsForAccess(inserted.data ?? [], access) });
}

export async function PATCH(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const { field, id, row, rowData, value } = (await request.json()) as {
    field?: string;
    id?: string;
    row?: AppealRow;
    rowData?: Record<string, string | number>;
    value?: string | number;
  };

  if ((!field && !rowData) || !row?.data) {
    return NextResponse.json({ error: "Row data is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const access = getAccessScope(auth.user);
  const scopedRowData = rowData ? applyAccessToRowData(rowData, access) : undefined;

  if (!id) {
    const inserted = await admin
      .from("gstat_appeals")
      .insert({
        created_by: auth.user.id,
        data: {
          ...(scopedRowData ?? applyAccessToRowData({ ...row.data, [field!]: value ?? "" }, access)),
          Sno: row.row_number ?? 1
        },
        organisation_code: organisationCode,
        row_number: row.row_number ?? 1,
        updated_by: auth.user.id
      })
      .select("id,row_number,data,updated_at")
      .single();

    if (inserted.error) {
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }

    await admin.from("gstat_audit_logs").insert({
      action: scopedRowData ? "create_row" : "create",
      actor_user_id: auth.user.id,
      appeal_id: inserted.data.id,
      field_name: scopedRowData ? "row" : field,
      new_value: scopedRowData ?? value ?? "",
      old_value: null,
      organisation_code: organisationCode
    });

    return NextResponse.json({ row: inserted.data });
  }

  const existing = await admin
    .from("gstat_appeals")
    .select("id,row_number,data")
    .eq("id", id)
    .eq("organisation_code", organisationCode)
    .single();

  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 404 });
  }

  if (!canAccessRow(existing.data, access)) {
    return NextResponse.json({ error: "Not allowed to update this GSTAT row." }, { status: 403 });
  }

  const oldValue = field ? existing.data.data?.[field] ?? "" : existing.data.data;
  const nextData = {
    ...(scopedRowData ?? applyAccessToRowData({ ...existing.data.data, [field!]: value ?? "" }, access)),
    Sno: existing.data.row_number ?? 1
  };

  const updated = await admin
    .from("gstat_appeals")
    .update({
      data: nextData,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id
    })
    .eq("id", id)
    .select("id,row_number,data,updated_at")
    .single();

  if (updated.error) {
    return NextResponse.json({ error: updated.error.message }, { status: 500 });
  }

  if (scopedRowData) {
    const changes = changedFields(existing.data.data ?? {}, scopedRowData);

    if (changes.length) {
      await admin.from("gstat_audit_logs").insert(
        changes.map((change) => ({
          action: "update",
          actor_user_id: auth.user.id,
          appeal_id: id,
          field_name: change.field,
          new_value: change.newValue,
          old_value: change.oldValue,
          organisation_code: organisationCode
        }))
      );
    }
  } else if (JSON.stringify(oldValue) !== JSON.stringify(value ?? "")) {
    await admin.from("gstat_audit_logs").insert({
      action: "update",
      actor_user_id: auth.user.id,
      appeal_id: id,
      field_name: field,
      new_value: value ?? "",
      old_value: oldValue,
      organisation_code: organisationCode
    });
  }

  return NextResponse.json({ row: updated.data });
}

function changedFields(
  oldData: Record<string, string | number>,
  newData: Record<string, string | number>
) {
  const fields = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));

  return fields
    .map((field) => ({
      field,
      newValue: newData[field] ?? "",
      oldValue: oldData[field] ?? ""
    }))
    .filter((change) => String(change.oldValue) !== String(change.newValue));
}

function applyAccessToRowData(data: Record<string, string | number>, access: AccessScope) {
  if (access.isPartner || !access.team) {
    return data;
  }

  return { ...data, "Person handling": access.team };
}

function canAccessRow(row: AppealRow, access: AccessScope) {
  return access.isPartner || !access.team || String(row.data?.["Person handling"] ?? "") === access.team;
}

function filterRowsForAccess<T extends AppealRow>(rows: T[], access: AccessScope) {
  if (access.isPartner || !access.team) {
    return rows;
  }

  return rows.filter((row) => canAccessRow(row, access));
}

function getAccessScope(user: { user_metadata?: Record<string, unknown> }): AccessScope {
  const role = String(user.user_metadata?.role ?? "").trim().toLowerCase();
  const team = String(user.user_metadata?.team ?? "").trim();

  return {
    isPartner: role === "partner",
    team
  };
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function renumberRows(rows: AppealRow[]) {
  return rows.map((row, index) => ({
    ...row,
    data: { ...row.data, Sno: index + 1 },
    row_number: index + 1
  }));
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
