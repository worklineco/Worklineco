import { createClient } from "@supabase/supabase-js";
import { createSign } from "node:crypto";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Nightly Excel backup to Google Drive.
 *
 * Runs at 00:00 IST. Exports every WorkLine
 * register to a fresh .xlsx workbook and uploads them into a dated subfolder
 * of the configured Google Drive folder:
 *
 *   WorkLine Backup 2026-08-10/
 *     workline-taskline-2026-08-10.xlsx
 *     workline-client-records-2026-08-10.xlsx
 *     workline-gstat-2026-08-10.xlsx
 *     workline-billing-2026-08-10.xlsx
 *     workline-gstat-billing-2026-08-10.xlsx
 *
 * Uploads authenticate as a Google service account (free) - see
 * docs/drive-backup-runbook.md for the one-time setup. The target folder can
 * be a normal link-shared folder; only its folder ID is needed.
 *
 * Environment variables:
 *   GOOGLE_OAUTH_CLIENT_ID              OAuth client id (recommended auth)
 *   GOOGLE_OAUTH_CLIENT_SECRET          OAuth client secret
 *   GOOGLE_OAUTH_REFRESH_TOKEN          refresh token for the Google account
 *                                       whose storage quota uploads should use
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL        (fallback) service account email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  (fallback) service account key (PEM;
 *                                       \n-escaped when stored in Vercel)
 *   DRIVE_BACKUP_FOLDER_ID              ID of the Drive folder (from its link)
 *   DRIVE_BACKUP_RETENTION_DAYS         optional; delete dated backup folders
 *                                       older than N days (0/unset = keep all)
 */

const fetchBatchSize = 1000;

type FlatRow = Record<string, string | number>;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const drive = driveConfiguration();
  if ("error" in drive) {
    return NextResponse.json({ error: drive.error }, { status: 500 });
  }

  const admin = createAdminClient();
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: 500 });
  }

  const dateKey = indiaDateKey();
  let accessToken: string;
  try {
    accessToken = await driveAccessToken(drive);
  } catch (error) {
    return NextResponse.json(
      { error: `Could not authenticate with Google Drive: ${message(error)}` },
      { status: 502 }
    );
  }

  const workbooks: { error?: string; name: string; sheets?: { name: string; rows: FlatRow[] }[] }[] = await Promise.all([
    buildTasklineWorkbook(admin.client, dateKey),
    buildClientRecordsWorkbook(admin.client, dateKey),
    buildTableWorkbook(admin.client, "gstat_appeals", "data", `workline-gstat-${dateKey}`, "GSTAT"),
    buildTableWorkbook(admin.client, "firm_billing_records", "custom_values", `workline-billing-${dateKey}`, "Billing"),
    buildTableWorkbook(admin.client, "gstat_billing_records", "custom_values", `workline-gstat-billing-${dateKey}`, "GSTAT Billing")
  ]);

  let folderId: string;
  try {
    folderId = await createDriveFolder(accessToken, drive.folderId, `WorkLine Backup ${dateKey}`);
  } catch (error) {
    return NextResponse.json(
      { error: `Could not create the backup folder in Google Drive: ${message(error)}` },
      { status: 502 }
    );
  }

  const uploaded: string[] = [];
  const failed: { error: string; name: string }[] = [];

  for (const workbook of workbooks) {
    if (workbook.error || !workbook.sheets) {
      failed.push({ error: workbook.error ?? "No data.", name: workbook.name });
      continue;
    }

    try {
      const buffer = workbookBuffer(workbook.sheets);
      await uploadToDrive(accessToken, folderId, `${workbook.name}.xlsx`, buffer);
      uploaded.push(`${workbook.name}.xlsx`);
    } catch (error) {
      failed.push({ error: message(error), name: workbook.name });
    }
  }

  let pruned = 0;
  const retentionDays = Number(process.env.DRIVE_BACKUP_RETENTION_DAYS ?? 0);
  if (Number.isFinite(retentionDays) && retentionDays > 0) {
    try {
      pruned = await pruneOldBackups(accessToken, drive.folderId, retentionDays);
    } catch (error) {
      console.error("Drive backup prune failed:", error);
    }
  }

  const status = uploaded.length ? 200 : 502;
  return NextResponse.json({ date: dateKey, failed, folder: `WorkLine Backup ${dateKey}`, pruned, uploaded }, { status });
}

// ---------------------------------------------------------------------------
// Register exports
// ---------------------------------------------------------------------------

async function fetchAllRows(
  admin: NonNullable<Extract<ReturnType<typeof createAdminClient>, { client: unknown }>>["client"],
  table: string,
  filter?: { column: string; value: string }
) {
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += fetchBatchSize) {
    let query = admin.from(table).select("*").order("created_at", { ascending: true }).range(from, from + fetchBatchSize - 1);
    if (filter) {
      query = query.eq(filter.column, filter.value);
    }

    const result = await query;
    if (result.error) {
      // Some tables order by different columns; retry without ordering.
      let fallback = admin.from(table).select("*").range(from, from + fetchBatchSize - 1);
      if (filter) {
        fallback = fallback.eq(filter.column, filter.value);
      }
      const retried = await fallback;
      if (retried.error) {
        throw new Error(retried.error.message);
      }
      rows.push(...((retried.data ?? []) as Record<string, unknown>[]));
      if ((retried.data ?? []).length < fetchBatchSize) {
        return rows;
      }
      continue;
    }

    rows.push(...((result.data ?? []) as Record<string, unknown>[]));
    if ((result.data ?? []).length < fetchBatchSize) {
      return rows;
    }
  }
}

function flattenRow(row: Record<string, unknown>, jsonColumn?: string): FlatRow {
  const flat: FlatRow = {};

  for (const [key, value] of Object.entries(row)) {
    if (jsonColumn && key === jsonColumn && value && typeof value === "object") {
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue && typeof innerValue === "object") {
          for (const [deepKey, deepValue] of Object.entries(innerValue as Record<string, unknown>)) {
            flat[deepKey] = cellValue(deepValue);
          }
        } else {
          flat[innerKey] = cellValue(innerValue);
        }
      }
      continue;
    }

    flat[key] = cellValue(value);
  }

  return flat;
}

function cellValue(value: unknown): string | number {
  if (typeof value === "number") {
    return value;
  }
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

async function buildTasklineWorkbook(
  admin: NonNullable<Extract<ReturnType<typeof createAdminClient>, { client: unknown }>>["client"],
  dateKey: string
) {
  const name = `workline-taskline-${dateKey}`;
  try {
    const rows = await fetchAllRows(admin, "tasks", { column: "custom_values->>workline_module", value: "taskline" });
    return { name, sheets: [{ name: "TaskLine", rows: rows.map((row) => flattenRow(row, "custom_values")) }] };
  } catch (error) {
    return { error: message(error), name };
  }
}

async function buildClientRecordsWorkbook(
  admin: NonNullable<Extract<ReturnType<typeof createAdminClient>, { client: unknown }>>["client"],
  dateKey: string
) {
  const name = `workline-client-records-${dateKey}`;
  try {
    const [active, trash] = await Promise.all([
      fetchAllRows(admin, "clients", { column: "custom_values->>source", value: "client_records_register" }),
      fetchAllRows(admin, "clients", { column: "custom_values->>source", value: "client_records_trash" })
    ]);
    return {
      name,
      sheets: [
        { name: "Client Records", rows: active.map((row) => flattenRow(row, "custom_values")) },
        { name: "Trash", rows: trash.map((row) => flattenRow(row, "custom_values")) }
      ]
    };
  } catch (error) {
    return { error: message(error), name };
  }
}

async function buildTableWorkbook(
  admin: NonNullable<Extract<ReturnType<typeof createAdminClient>, { client: unknown }>>["client"],
  table: string,
  jsonColumn: string,
  name: string,
  sheetName: string
) {
  try {
    const rows = await fetchAllRows(admin, table);
    return { name, sheets: [{ name: sheetName, rows: rows.map((row) => flattenRow(row, jsonColumn)) }] };
  } catch (error) {
    return { error: message(error), name };
  }
}

function workbookBuffer(sheets: { name: string; rows: FlatRow[] }[]) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{ note: "No rows" }]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }

  return XLSX.write(workbook, { bookType: "xlsx", compression: true, type: "buffer" }) as Buffer;
}

// ---------------------------------------------------------------------------
// Google Drive (service account, no extra dependencies)
// ---------------------------------------------------------------------------

type DriveConfiguration = {
  clientId?: string;
  clientSecret?: string;
  email?: string;
  folderId: string;
  privateKey?: string;
  refreshToken?: string;
};

function driveConfiguration(): { error: string } | DriveConfiguration {
  const email = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim();
  const privateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  const folderId = String(process.env.DRIVE_BACKUP_FOLDER_ID ?? "").trim();
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "").trim();
  const refreshToken = String(process.env.GOOGLE_OAUTH_REFRESH_TOKEN ?? "").trim();

  if (!folderId) {
    return { error: "Drive backup is not configured. Set DRIVE_BACKUP_FOLDER_ID." };
  }

  // Preferred: OAuth refresh token for a real Google account. Uploads then use
  // that account's own storage quota (service accounts have none on personal
  // Drive, so uploads fail with "Service Accounts do not have storage quota").
  if (clientId && clientSecret && refreshToken) {
    return { clientId, clientSecret, folderId, refreshToken };
  }

  if (email && privateKey) {
    return { email, folderId, privateKey };
  }

  return {
    error:
      "Drive backup is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN (recommended), or GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY."
  };
}

async function driveAccessToken(drive: DriveConfiguration) {
  if (drive.clientId && drive.clientSecret && drive.refreshToken) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      body: new URLSearchParams({
        client_id: drive.clientId,
        client_secret: drive.clientSecret,
        grant_type: "refresh_token",
        refresh_token: drive.refreshToken
      }),
      method: "POST"
    });
    const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string };

    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error_description || `Google token refresh failed (${response.status}).`);
    }

    return payload.access_token;
  }

  const email = drive.email ?? "";
  const privateKey = drive.privateKey ?? "";
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
      iss: email,
      scope: "https://www.googleapis.com/auth/drive"
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(privateKey).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer"
    }),
    method: "POST"
  });
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || `Google token request failed (${response.status}).`);
  }

  return payload.access_token;
}

async function createDriveFolder(accessToken: string, parentId: string, name: string) {
  // Reuse today's folder if it already exists (e.g. a retried run).
  const escapedName = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`
  );
  const existing = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const existingPayload = (await existing.json().catch(() => ({}))) as { files?: { id: string }[] };
  const existingId = existingPayload.files?.[0]?.id;
  if (existing.ok && existingId) {
    return existingId;
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    body: JSON.stringify({
      mimeType: "application/vnd.google-apps.folder",
      name,
      parents: [parentId]
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string }; id?: string };

  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || `Drive folder create failed (${response.status}).`);
  }

  return payload.id;
}

async function uploadToDrive(accessToken: string, folderId: string, filename: string, content: Buffer) {
  const boundary = `workline-${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
    ),
    content,
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      body: body as unknown as BodyInit,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      method: "POST"
    }
  );
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string }; id?: string };

  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || `Drive upload failed (${response.status}).`);
  }

  return payload.id;
}

async function pruneOldBackups(accessToken: string, parentId: string, retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const query = encodeURIComponent(
    `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains 'WorkLine Backup' and createdTime < '${cutoff}' and trashed = false`
  );
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const payload = (await response.json().catch(() => ({}))) as { files?: { id: string; name: string }[] };

  let pruned = 0;
  for (const file of payload.files ?? []) {
    const deleted = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "DELETE"
    });
    if (deleted.ok) {
      pruned += 1;
    }
  }

  return pruned;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (cronSecret) {
    return authorization === `Bearer ${cronSecret}`;
  }

  return request.headers.get("user-agent")?.toLowerCase().startsWith("vercel-cron/") ?? false;
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: "Backup service is not configured." as const };
  }

  return { client: createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }) };
}

function indiaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric"
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}


