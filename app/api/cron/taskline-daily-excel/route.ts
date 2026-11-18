import { createClient } from "@supabase/supabase-js";
import { createTransport } from "nodemailer";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Emails the full TaskLine (all registers) as one Excel workbook, daily.
// Scheduled from vercel.json at 04:30 UTC = 10:00 IST.
const RECIPIENT = "yash@dhaddaonline.com";
const ORGANISATION_CODE = "DCO1433";
const fetchBatchSize = 1000;

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

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WorkLine Co";
  workbook.created = new Date();

  const perRegister: { label: string; rows: number }[] = [];
  let totalRows = 0;

  for (const register of REGISTERS) {
    const rows = await loadModuleRows(admin, organisationId, register.module);
    totalRows += rows.length;
    perRegister.push({ label: register.label, rows: rows.length });

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

    for (const row of rows) {
      const record: TaskLineRow = {};
      for (const column of columns) {
        record[column] = text(row[column]);
      }
      sheet.addRow(record);
    }
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

  const summary = perRegister.map((entry) => `• ${entry.label}: ${entry.rows}`).join("\n");

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
      subject: `WorkLine TaskLine — all registers (${dateKey})`,
      text:
        `Attached is the full TaskLine export (all registers) as on ${dateKey}.\n\n` +
        `Each register is a separate sheet:\n${summary}\n\nTotal records: ${totalRows}.\n\n— WorkLine Co`,
      to: RECIPIENT
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send the TaskLine email." },
      { status: 500 }
    );
  }

  return NextResponse.json({ file: filename, ok: true, registers: perRegister, sentTo: RECIPIENT, totalRows });
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
