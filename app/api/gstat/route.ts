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

const organisationCode = "DCO1433";

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gstat_appeals")
    .select("id,row_number,data,updated_at")
    .eq("organisation_code", organisationCode)
    .order("row_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const {
    action = "import",
    rowIndex,
    rows
  } = (await request.json()) as { action?: string; rowIndex?: number; rows?: AppealRow[] };
  const auditAction = ["import", "row_insert", "row_delete", "bulk_save"].includes(action)
    ? action
    : "bulk_save";

  const admin = createAdminClient();
  const previous = await admin
    .from("gstat_appeals")
    .select("id,data,row_number")
    .eq("organisation_code", organisationCode);

  if (previous.error) {
    return NextResponse.json({ error: previous.error.message }, { status: 500 });
  }

  if (auditAction === "row_insert" || auditAction === "row_delete") {
    const existingRows = (previous.data ?? [])
      .sort((first, second) => (first.row_number ?? 0) - (second.row_number ?? 0))
      .map((row) => ({ data: row.data ?? {}, row_number: row.row_number ?? 1 }));
    const nextRows =
      auditAction === "row_insert"
        ? renumberRows([
            ...existingRows.slice(0, (rowIndex ?? -1) + 1),
            { data: {}, row_number: (rowIndex ?? -1) + 2 },
            ...existingRows.slice((rowIndex ?? -1) + 1)
          ])
        : renumberRows(
            existingRows.length > 1
              ? existingRows.filter((_, index) => index !== rowIndex)
              : [{ data: {}, row_number: 1 }]
          );

    return replaceRows(admin, auth.user.id, nextRows, auditAction, previous.data?.length ?? 0);
  }

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Rows are required." }, { status: 400 });
  }

  return replaceRows(admin, auth.user.id, rows, auditAction, previous.data?.length ?? 0);
}

async function replaceRows(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  rows: AppealRow[],
  auditAction: string,
  previousRowCount: number
) {
  const { error: deleteError } = await admin
    .from("gstat_appeals")
    .delete()
    .eq("organisation_code", organisationCode);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const insertRows = rows.map((row, index) => ({
    created_by: userId,
    data: row.data ?? {},
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

  return NextResponse.json({ rows: inserted.data ?? [] });
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

  if (!id) {
    const inserted = await admin
      .from("gstat_appeals")
      .insert({
        created_by: auth.user.id,
        data: rowData ?? { ...row.data, [field!]: value ?? "" },
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
      action: rowData ? "create_row" : "create",
      actor_user_id: auth.user.id,
      appeal_id: inserted.data.id,
      field_name: rowData ? "row" : field,
      new_value: rowData ?? value ?? "",
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

  const oldValue = field ? existing.data.data?.[field] ?? "" : existing.data.data;
  const nextData = rowData ?? { ...existing.data.data, [field!]: value ?? "" };

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

  if (JSON.stringify(oldValue) !== JSON.stringify(rowData ?? value ?? "")) {
    await admin.from("gstat_audit_logs").insert({
      action: rowData ? "update_row" : "update",
      actor_user_id: auth.user.id,
      appeal_id: id,
      field_name: rowData ? "row" : field,
      new_value: rowData ?? value ?? "",
      old_value: oldValue,
      organisation_code: organisationCode
    });
  }

  return NextResponse.json({ row: updated.data });
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
