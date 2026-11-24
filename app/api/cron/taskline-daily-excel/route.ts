import { createClient } from "@supabase/supabase-js";
import { createTransport } from "nodemailer";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Emails the TaskLine (all registers) as one Excel workbook, daily.
// Only rows whose due date falls within the next 3 months (today .. today+3
// months, inclusive, India time) are included; every column is kept.
// Scheduled from vercel.json at 04:30 UTC = 10:00 IST.
const RECIPIENT = "yash@dhaddaonline.com";
const ORGANISATION_CODE = "DCO1433";
const fetchBatchSize = 1000;
const WINDOW_MONTHS = 3;
const DUE_FIELD = "due_date";

// Each register becomes its own worksheet. The module key is the value stored
// in custom_values.workline_module; the label is the sheet/section name.
const REGISTERS: { label: string; module: string }[] = [
  { label: "Litigation", module: "taskline" },
  { label: "Non-Litigation", module: "non_litigation" },
  { label: "CESTAT", module: "cestat" },
  { label: "High Court", module: "high_court" }
];

type TaskLineRow = Record<string, string>;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const smtp = smtpConfiguration();
  if ("error" in smtp) {
    return NextResponse.json({ error: smtp.error }, { status: 500 });
  }

  const admin = createAdminClient();

  const organisation = await admin
    .from("organisations")
    .select("id")
    .eq("slug", ORGANISATION_CODE.toLowerCase())
    .maybeSingle();

  if (organisation.error) {
    return NextResponse.json({ error: organisation.error.message }, { status: 500 });
  }
  const organisationId = organisation.data?.id as string | undefined;
  if (!organisationId) {
    return NextResponse.json({ error: "Organisation not found." }, { status: 500 });
  }

  // One send per IST day: both the Vercel cron and the GitHub trigger call
  // this endpoint, so whichever runs first sends and the later one skips.
  const dayKey = indiaDateKey();
  const alreadySent = await admin
    .from("audit_logs")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("entity_type", "taskline_daily_excel")
    .eq("action", "taskline.daily_excel_sent")
    .eq("new_value->>day", dayKey)
    .limit(1)
    .maybeSingle();

  if (alreadySent.data) {
    return NextResponse.json({ ok: true, sent: false, skipped: `Already sent for ${dayKey}.` });
  }

  const dueRange = dueWindow();

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WorkLine Co";
  workbook.created = new Date();

  const perRegister: { label: string; total: number; inWindow: number }[] = [];
  let totalRows = 0;
  let totalInWindow = 0;

  for (const register of REGISTERS) {
    // Every row is included; rows outside the next-3-months window are hidden
    // so the sheet opens showing that window, with the full data underneath.
    const rows = await loadModuleRows(admin, organisationId, register.module);
    totalRows += rows.length;

    const sheet = workbook.addWorksheet(sheetName(register.label));

    // Columns = the union of every row's keys, in first-seen order, so nothing
    // is dropped even when different rows carry different fields.
    const columns: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          columns.push(key);
        }
      }
    }

    if (columns.length === 0) {
      sheet.addRow(["No records in this register."]);
      perRegister.push({ inWindow: 0, label: register.label, total: 0 });
      continue;
    }

    sheet.columns = columns.map((header) => ({
      header,
      key: header,
      width: Math.min(44, Math.max(12, header.length + 4))
    }));
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B3360" } };
    headerRow.alignment = { vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    let inWindow = 0;
    for (const row of rows) {
      const record: TaskLineRow = {};
      for (const column of columns) {
        record[column] = text(row[column]);
      }
      const added = sheet.addRow(record);
      if (isWithinWindow(row[DUE_FIELD], dueRange)) {
        inWindow += 1;
      } else {
        // Hidden, not deleted — clearing the hide/filter reveals it again.
        added.hidden = true;
      }
    }
    totalInWindow += inWindow;
    perRegister.push({ inWindow, label: register.label, total: rows.length });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const dateKey = indiaDateKey();
  const filename = `WorkLine_TaskLine_All_Registers_${dateKey}.xlsx`;

  const transporter = createTransport({
    auth: { pass: smtp.password, user: smtp.user },
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465
  });

  const summary = perRegister.map((entry) => `• ${entry.label}: ${entry.inWindow} of ${entry.total}`).join("\n");
  const windowRange = `${dueRange.startDisplay} to ${dueRange.endDisplay}`;

  try {
    await transporter.sendMail({
      attachments: [
        {
          content: buffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          filename
        }
      ],
      from: smtp.from,
      subject: `WorkLine TaskLine — all registers, due-in-3-months view (${dateKey})`,
      text:
        `Attached is the full TaskLine export (all registers) as on ${dateKey}.\n\n` +
        `Every task is included. Each sheet opens filtered to tasks due in the next 3 months ` +
        `(due dates ${windowRange}); rows outside that window are hidden, not removed — to see ` +
        `everything, select all rows and Unhide, or clear the column filter.\n\n` +
        `Due in the next 3 months, per register (in-window of total):\n${summary}\n\n` +
        `In-window: ${totalInWindow}. All records: ${totalRows}.\n\n— WorkLine Co`,
      to: RECIPIENT
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send the TaskLine email." },
      { status: 500 }
    );
  }

  // Record the send so a second trigger on the same IST day skips instead of
  // mailing the workbook twice. A failed log never fails the already-sent run.
  await admin.from("audit_logs").insert({
    action: "taskline.daily_excel_sent",
    actor_user_id: null,
    entity_id: organisationId,
    entity_type: "taskline_daily_excel",
    new_value: { day: dayKey, recipient: RECIPIENT, sent_at: new Date().toISOString() },
    old_value: null,
    organisation_id: organisationId
  });

  return NextResponse.json({
    dueFrom: dueRange.startDisplay,
    dueTo: dueRange.endDisplay,
    file: filename,
    ok: true,
    registers: perRegister,
    sentTo: RECIPIENT,
    totalInWindow,
    totalRows
  });
}

// --- Next-3-months due-date window (India time) ---------------------------

type DueWindow = { startMs: number; endMs: number; startDisplay: string; endDisplay: string };

// Window = today (inclusive) through today + WINDOW_MONTHS (inclusive), using
// the India-time calendar date for "today". A short/long month on the far end
// is clamped to its last valid day (e.g. 30 Nov + 3m = 28/29 Feb).
function dueWindow(): DueWindow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric"
  }).formatToParts(new Date());
  const num = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  const year = num("year");
  const month = num("month");
  const day = num("day");

  const startMs = Date.UTC(year, month - 1, day);

  const totalMonths = month - 1 + WINDOW_MONTHS;
  const endYear = year + Math.floor(totalMonths / 12);
  const endMonth = totalMonths % 12; // 0-11
  const daysInEndMonth = new Date(Date.UTC(endYear, endMonth + 1, 0)).getUTCDate();
  const endDay = Math.min(day, daysInEndMonth);
  const endMs = Date.UTC(endYear, endMonth, endDay);

  return {
    endDisplay: `${pad2(endDay)}-${pad2(endMonth + 1)}-${endYear}`,
    endMs,
    startDisplay: `${pad2(day)}-${pad2(month)}-${year}`,
    startMs
  };
}

// True when the stored due-date value parses and lands inside the window.
// Blank, unparseable, overdue, and beyond-window dates are all excluded.
function isWithinWindow(value: unknown, range: DueWindow) {
  const ms = dueDateMs(value);
  if (ms === null) {
    return false;
  }
  return ms >= range.startMs && ms <= range.endMs;
}

// Returns the UTC-midnight ms for a stored due date, or null. Mirrors the
// app's own normalizeDisplayDate/parseDisplayDate so this reads dates exactly
// as the register UI does (accepts DD-MM-YYYY, D/M/YY, YYYY-MM-DD, etc.).
function dueDateMs(value: unknown): number | null {
  const normalized = normalizeDisplayDate(value);
  const parsed = parseDisplayDate(normalized);
  return parsed ? parsed.getTime() : null;
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

// Reads every task row of one register for the organisation, paging past the
// 1,000-row Supabase cap, and returns their taskline_data dictionaries.
async function loadModuleRows(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  moduleKey: string
) {
  const rows: TaskLineRow[] = [];
  for (let from = 0; ; from += fetchBatchSize) {
    const page = await admin
      .from("tasks")
      .select("id,taskline_data:custom_values->taskline_data")
      .eq("organisation_id", organisationId)
      .eq("custom_values->>workline_module", moduleKey)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + fetchBatchSize - 1);

    if (page.error) {
      throw new Error(page.error.message);
    }
    const batch = (page.data ?? []) as { id: string; taskline_data: TaskLineRow | null }[];
    for (const item of batch) {
      if (item.taskline_data && typeof item.taskline_data === "object") {
        rows.push(item.taskline_data);
      }
    }
    if (batch.length < fetchBatchSize) {
      break;
    }
  }
  return rows;
}

// Excel sheet names cannot exceed 31 chars or contain : \ / ? * [ ].
function sheetName(label: string) {
  return label.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
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

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (cronSecret) {
    return authorization === `Bearer ${cronSecret}`;
  }

  return request.headers.get("user-agent")?.toLowerCase().startsWith("vercel-cron/") ?? false;
}

function smtpConfiguration() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const from = process.env.TASK_REMINDER_FROM_EMAIL ?? process.env.OTP_FROM_EMAIL ?? "";
  const user = process.env.SMTP_USER ?? extractEmailAddress(from);
  const password = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, "");

  if (!host || !user || !password || !Number.isFinite(port)) {
    return { error: "TaskLine email is not configured." as const };
  }

  return { from: from || `WorkLine Co <${user}>`, host, password, port, user };
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return match?.[1]?.trim() || (value.includes("@") ? value.trim() : undefined);
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("TaskLine export service is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
