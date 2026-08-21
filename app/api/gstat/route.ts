import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isViewOnlyRegisterUser, viewOnlyRegisterResponse } from "@/lib/register-access";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type AppealRow = {
  data: Record<string, string | number>;
  id?: string;
  import_action?: string;
  row_number?: number;
};
type ExistingAppealRow = AppealRow & { id: string };
type AccessScope = {
  isPartner: boolean;
  team: string;
};

const organisationCode = "DCO1433";

function gstatFyMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  const fyCode = `${String(fyStart).slice(2)}${String(fyEnd).slice(2)}`;
  return `${fyCode}-${String(month).padStart(2, "0")}`;
}
const maxBulkDeleteRows = 5;

export async function GET(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const access = getAccessScope(auth.user);
  const view = new URL(request.url).searchParams.get("view");
  const { data, error } = await admin
    .from("gstat_appeals")
    .select("id,row_number,data,updated_at")
    .eq("organisation_code", organisationCode)
    .order("row_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const scopedRows = filterRowsForAccess(data ?? [], access);

  if (view === "link-preview") {
    const taskCode = new URL(request.url).searchParams.get("taskCode")?.trim();

    if (!taskCode) {
      return NextResponse.json({ error: "Enter a GSTAT Task Code." }, { status: 400 });
    }

    const matches = scopedRows.filter(
      (row) =>
        String(row.data?.Sno ?? row.row_number ?? "").trim().toLocaleLowerCase() === taskCode.toLocaleLowerCase()
    );

    if (!matches.length) {
      return NextResponse.json(
        { error: `No accessible GSTAT record was found for Task Code ${taskCode}.` },
        { status: 404 }
      );
    }

    if (matches.length > 1) {
      return NextResponse.json(
        { error: `More than one GSTAT record uses Task Code ${taskCode}. Please contact the administrator.` },
        { status: 409 }
      );
    }

    const row = matches[0];
    return NextResponse.json({
      linkPreview: {
        arn: String(row.data?.["ARN of First Appeal"] ?? "").trim(),
        entityName: String(row.data?.["Entity Name"] ?? "").trim(),
        fy: String(row.data?.FY ?? "").trim(),
        id: String(row.id ?? "").trim(),
        nextHearingDate: String(row.data?.["Next Hearing Date"] ?? "").trim(),
        oiaNo: String(row.data?.["OIA No"] ?? "").trim(),
        personHandling: String(row.data?.["Person handling"] ?? "").trim(),
        stateName: String(row.data?.["State Name"] ?? "").trim(),
        status: String(row.data?.Status ?? "").trim(),
        taskCode: String(row.data?.Sno ?? row.row_number ?? "").trim()
      }
    });
  }

  const billRaisedAppealIds = await getBillRaisedAppealIds(admin);

  return NextResponse.json({ rows: markBillRaised(scopedRows, billRaisedAppealIds) });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  if (isViewOnlyRegisterUser(auth.user)) {
    return viewOnlyRegisterResponse("GSTAT");
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
    const existingRows = filterRowsForAccess((previous.data ?? []) as ExistingAppealRow[], access)
      .sort((first, second) => (first.row_number ?? 0) - (second.row_number ?? 0))
      .map((row) => ({ id: row.id, data: row.data ?? {}, row_number: row.row_number ?? 1 }));
    const selectedRowIndexes = new Set(
      (Array.isArray(rowIndexes) ? rowIndexes : []).filter((index) => Number.isInteger(index) && index >= 0)
    );

    if (auditAction === "bulk_delete" && selectedRowIndexes.size > maxBulkDeleteRows) {
      return NextResponse.json(
        { error: `You can delete at most ${maxBulkDeleteRows} GSTAT rows at once.` },
        { status: 400 }
      );
    }

    const shouldRenumberRows = access.isPartner || !access.team;
    const fallbackRow = { data: {}, row_number: shouldRenumberRows ? 1 : await getNextRowNumber(admin) };
    const insertedRow = { data: {}, row_number: shouldRenumberRows ? (rowIndex ?? -1) + 2 : await getNextRowNumber(admin) };
    const insertedRows =
      auditAction === "row_insert"
        ? [
            ...existingRows.slice(0, (rowIndex ?? -1) + 1),
            insertedRow,
            ...existingRows.slice((rowIndex ?? -1) + 1)
          ]
        : [];
    const deletedRows =
      auditAction === "bulk_delete"
        ? existingRows.length > selectedRowIndexes.size
          ? existingRows.filter((_, index) => !selectedRowIndexes.has(index))
          : [fallbackRow]
        : existingRows.length > 1
          ? existingRows.filter((_, index) => index !== rowIndex)
          : [fallbackRow];
    const nextRows =
      auditAction === "row_insert"
        ? shouldRenumberRows
          ? renumberRows(insertedRows)
          : insertedRows
        : shouldRenumberRows
          ? renumberRows(deletedRows)
          : deletedRows;
    const trashRows =
      auditAction === "bulk_delete"
        ? existingRows.filter((_, index) => selectedRowIndexes.has(index))
        : auditAction === "row_delete"
          ? existingRows.filter((_, index) => index === rowIndex)
          : [];

    return replaceRows(admin, auth.user.id, nextRows, auditAction, previous.data?.length ?? 0, access, trashRows);
  }

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Rows are required." }, { status: 400 });
  }

  const scopedRows = rows.map((row) => ({
    ...row,
    data: applyAccessToRowData(row.data ?? {}, access)
  }));

  if (auditAction === "import") {
    const importRows = scopedRows.map((row) => ({
      action: normalizeImportAction(row.import_action),
      row
    }));
    const addRows = importRows.filter((item) => item.action === "add").map((item) => item.row);
    const updateRows = importRows.filter((item) => item.action === "update");
    const deleteRows = importRows.filter((item) => item.action === "delete");
    const existingRows = filterRowsForAccess((previous.data ?? []) as ExistingAppealRow[], access);
    const appendedResponse = addRows.length
      ? await appendRows(admin, auth.user.id, addRows, previous.data?.length ?? 0, access, false)
      : null;

    if (appendedResponse && appendedResponse.status >= 400) {
      return appendedResponse;
    }

    const updateResults: Array<{
      error: { message: string } | null;
      outcome: "skipped" | "unchanged" | "updated";
    }> = [];

    for (let index = 0; index < updateRows.length; index += 25) {
      const batchResults = await Promise.all(
        updateRows.slice(index, index + 25).map(async (item) => {
          const matched = findMatchingGstatRow(existingRows, item.row);

          if (!matched) {
            return { error: null, outcome: "skipped" as const };
          }

          const nextData = {
            ...(matched.data ?? {}),
            ...(item.row.data ?? {}),
            Sno: matched.row_number ?? item.row.data.Sno ?? 1
          };
          const changes = changedFields(matched.data ?? {}, nextData);

          if (!changes.length) {
            return { error: null, outcome: "unchanged" as const };
          }

          const updated = await admin
            .from("gstat_appeals")
            .update({
              data: nextData,
              updated_at: new Date().toISOString(),
              updated_by: auth.user.id
            })
            .eq("id", matched.id)
            .eq("organisation_code", organisationCode)
            .select("id,row_number,data,updated_at")
            .single();

          if (!updated.error) {
            await admin.from("gstat_audit_logs").insert(
              changes.map((change) => ({
                action: "update",
                actor_user_id: auth.user.id,
                appeal_id: matched.id,
                field_name: change.field,
                new_value: change.newValue,
                old_value: change.oldValue,
                organisation_code: organisationCode
              }))
            );
          }

          return { error: updated.error, outcome: "updated" as const };
        })
      );
      updateResults.push(...batchResults);
    }

    const updateError = updateResults.find((result) => result.error)?.error;

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const deleteMatches = deleteRows
      .map((item) => findMatchingGstatRow(existingRows, item.row))
      .filter((row): row is ExistingAppealRow => Boolean(row));
    const uniqueDeleteMatches = Array.from(new Map(deleteMatches.map((row) => [row.id, row])).values());
    const trashError = await saveRowsToTrash(admin, auth.user.id, "import_delete", uniqueDeleteMatches);

    if (trashError) {
      return NextResponse.json({ error: trashError.message }, { status: 500 });
    }

    if (uniqueDeleteMatches.length) {
      const deleted = await admin
        .from("gstat_appeals")
        .delete()
        .eq("organisation_code", organisationCode)
        .in("id", uniqueDeleteMatches.map((row) => row.id));

      if (deleted.error) {
        return NextResponse.json({ error: deleted.error.message }, { status: 500 });
      }
    }

    const summary = {
      added: addRows.length,
      deleted: uniqueDeleteMatches.length,
      row_count: importRows.length,
      skipped:
        updateResults.filter((result) => result.outcome === "skipped").length +
        Math.max(0, deleteRows.length - uniqueDeleteMatches.length),
      unchanged: updateResults.filter((result) => result.outcome === "unchanged").length,
      updated: updateResults.filter((result) => result.outcome === "updated").length
    };

    await admin.from("gstat_audit_logs").insert({
      action: "import",
      actor_user_id: auth.user.id,
      field_name: "import",
      new_value: summary,
      old_value: { row_count: previous.data?.length ?? 0 },
      organisation_code: organisationCode
    });

    const current = await admin
      .from("gstat_appeals")
      .select("id,row_number,data,updated_at")
      .eq("organisation_code", organisationCode)
      .order("row_number", { ascending: true });

    if (current.error) {
      return NextResponse.json({ error: current.error.message }, { status: 500 });
    }

    return NextResponse.json({
      rows: filterRowsForAccess(current.data ?? [], access),
      summary
    });
  }

  return replaceRows(
    admin,
    auth.user.id,
    scopedRows,
    auditAction,
    previous.data?.length ?? 0,
    access,
    filterRowsForAccess((previous.data ?? []) as ExistingAppealRow[], access)
  );
}

async function replaceRows(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  rows: AppealRow[],
  auditAction: string,
  previousRowCount: number,
  access: AccessScope = { isPartner: true, team: "" },
  trashRows: ExistingAppealRow[] = []
) {
  const trashError = await saveRowsToTrash(admin, userId, auditAction, trashRows);

  if (trashError) {
    return NextResponse.json({ error: trashError.message }, { status: 500 });
  }

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

  const insertRows = rows.map((row, index) => {
    const rowNumber = row.row_number ?? index + 1;

    return {
      created_by: userId,
      data: { ...(row.data ?? {}), Sno: rowNumber },
      organisation_code: organisationCode,
      row_number: rowNumber,
      updated_by: userId
    };
  });

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

async function appendRows(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  rows: AppealRow[],
  previousRowCount: number,
  access: AccessScope,
  writeAudit = true
) {
  const nextRowNumber = await getNextRowNumber(admin);
  const insertRows = rows.map((row, index) => {
    const rowNumber = nextRowNumber + index;

    return {
      created_by: userId,
      data: { ...(row.data ?? {}), Sno: rowNumber },
      organisation_code: organisationCode,
      row_number: rowNumber,
      updated_by: userId
    };
  });

  const inserted = insertRows.length
    ? await admin
        .from("gstat_appeals")
        .insert(insertRows)
        .select("id,row_number,data,updated_at")
    : { data: [], error: null };

  if (inserted.error) {
    return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  }

  if (writeAudit) {
    await admin.from("gstat_audit_logs").insert({
      action: "import",
      actor_user_id: userId,
      field_name: "import",
      new_value: { added_row_count: rows.length, row_count: previousRowCount + rows.length },
      old_value: { row_count: previousRowCount },
      organisation_code: organisationCode
    });
  }

  const current = await admin
    .from("gstat_appeals")
    .select("id,row_number,data,updated_at")
    .eq("organisation_code", organisationCode)
    .order("row_number", { ascending: true });

  if (current.error) {
    return NextResponse.json({ error: current.error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: filterRowsForAccess(current.data ?? [], access) });
}

async function saveRowsToTrash(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  action: string,
  rows: ExistingAppealRow[]
) {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values());

  if (!uniqueRows.length) {
    return null;
  }

  const { error } = await admin.from("gstat_deleted_appeals").insert(
    uniqueRows.map((row) => ({
      data: row.data ?? {},
      delete_action: action,
      deleted_by: userId,
      original_appeal_id: row.id,
      original_row_number: row.row_number ?? 1,
      organisation_code: organisationCode
    }))
  );

  return error;
}

export async function PATCH(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  if (isViewOnlyRegisterUser(auth.user)) {
    return viewOnlyRegisterResponse("GSTAT");
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
    const nextRowNumber = await getNextRowNumber(admin);
    let taskCode = "";
    try {
      const organisation = await admin.from("organisations").select("id").eq("slug", organisationCode.toLowerCase()).maybeSingle();
      if (organisation.data?.id) {
        const fyMonth = gstatFyMonth(new Date());
        const { data: seq, error: seqError } = await admin.rpc("next_taskline_code_seq", { p_fy_month: fyMonth, p_org: organisation.data.id });
        if (!seqError && typeof seq === "number") {
          taskCode = `W${fyMonth}-${String(seq).padStart(3, "0")}`;
        }
      }
    } catch {
      // Task code is optional until database/016_taskline_task_code.sql is applied.
    }
    const inserted = await admin
      .from("gstat_appeals")
      .insert({
        created_by: auth.user.id,
        data: {
          ...(scopedRowData ?? applyAccessToRowData({ ...row.data, [field!]: value ?? "" }, access)),
          Sno: taskCode || nextRowNumber
        },
        organisation_code: organisationCode,
        row_number: nextRowNumber,
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
    .select("id,row_number,data,updated_at")
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
  const rowChanges = scopedRowData ? changedFields(existing.data.data ?? {}, scopedRowData) : [];

  if (scopedRowData && rowChanges.length === 0) {
    return NextResponse.json({ row: existing.data });
  }

  if (!scopedRowData && JSON.stringify(oldValue) === JSON.stringify(value ?? "")) {
    return NextResponse.json({ row: existing.data });
  }

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
    if (rowChanges.length) {
      await admin.from("gstat_audit_logs").insert(
        rowChanges.map((change) => ({
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

function findMatchingGstatRow(rows: ExistingAppealRow[], incoming: AppealRow) {
  if (incoming.id) {
    const matchedById = rows.find((row) => row.id === incoming.id);

    if (matchedById) {
      return matchedById;
    }
  }

  const incomingSno = Number(incoming.row_number ?? incoming.data?.Sno);

  if (Number.isFinite(incomingSno) && incomingSno > 0) {
    return rows.find((row) => Number(row.row_number ?? row.data?.Sno) === incomingSno) ?? null;
  }

  return null;
}

async function getBillRaisedAppealIds(admin: ReturnType<typeof createAdminClient>) {
  const firmRecords = await admin
    .from("firm_billing_records")
    .select("gstat_appeal_id")
    .eq("organisation_code", organisationCode)
    .not("gstat_appeal_id", "is", null);

  if (!firmRecords.error) {
    return new Set((firmRecords.data ?? []).map((record) => String(record.gstat_appeal_id ?? "")).filter(Boolean));
  }

  const legacyRecords = await admin
    .from("gstat_billing_records")
    .select("gstat_appeal_id")
    .eq("organisation_code", organisationCode)
    .not("gstat_appeal_id", "is", null);

  return new Set((legacyRecords.data ?? []).map((record) => String(record.gstat_appeal_id ?? "")).filter(Boolean));
}

function markBillRaised<T extends AppealRow>(rows: T[], billRaisedAppealIds: Set<string>) {
  return rows.map((row) => ({
    ...row,
    data: {
      ...(row.data ?? {}),
      "Bill raised": row.id && billRaisedAppealIds.has(row.id) ? "Yes" : "No"
    }
  }));
}

function getAccessScope(user: { user_metadata?: Record<string, unknown> }): AccessScope {
  const role = String(user.user_metadata?.role ?? "").trim().toLowerCase();
  const team = String(user.user_metadata?.team ?? "").trim();

  return {
    isPartner: role === "partner",
    team
  };
}

async function getNextRowNumber(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin
    .from("gstat_appeals")
    .select("row_number")
    .eq("organisation_code", organisationCode)
    .order("row_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.row_number ?? 0) + 1;
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
