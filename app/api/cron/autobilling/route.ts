import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Autobilling: retainer clients whose record sets Autobilling = Yes get a
// billing entry automatically every month on their chosen billing day. When a
// month is shorter than the chosen day (the 31st in February, say), the entry
// is created on that month's last day. Entries are numbered RAB-YYYYMM-01,
// RAB-YYYYMM-02, ... (Retainer Auto Billing) within each month, and each
// entry's remarks carry a hidden [AB <client id>] marker so a re-run can
// never create the same client's bill twice in one month.

type ClientRow = {
  custom_values: Record<string, string | number> | null;
  id: string;
  name: string;
  organisation_id: string;
};

const clientSourceKey = "client_records_register";
const billingTableName = "firm_billing_records";
const defaultOrganisationCode = "DCO1433";
const fetchBatchSize = 1000;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = indiaToday();
  const clients = await loadAutobillingClients(admin);

  if ("error" in clients) {
    return NextResponse.json({ error: clients.error }, { status: 500 });
  }

  // Keep only the clients whose effective billing day is today.
  const lastDayOfMonth = daysInMonth(today.year, today.month);
  const dueClients = clients.rows.filter((client) => {
    // Autobilling only applies to retainer clients (the modal enforces this
    // too; the check here keeps hand-imported data honest).
    if (String(client.custom_values?.["Client Type"] ?? "").trim() !== "Retainer") return false;
    const day = Number(String(client.custom_values?.["Billing Date"] ?? "").trim());
    if (!Number.isInteger(day) || day < 1 || day > 31) return false;
    return Math.min(day, lastDayOfMonth) === today.day;
  });

  if (!dueClients.length) {
    return NextResponse.json({ created: 0, date: today.key, due: 0, skipped: 0 });
  }

  // One month, one bill: this month's autobilling entries carry an
  // [AB <client id>] marker in remarks - skip clients already billed.
  const monthKey = `${today.year}${String(today.month).padStart(2, "0")}`;
  const existing = await admin
    .from(billingTableName)
    .select("task_code,remarks")
    .like("task_code", `RAB-${monthKey}-%`);

  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  const existingRows = (existing.data ?? []) as Array<{ remarks?: string; task_code?: string }>;
  const billedClientIds = new Set<string>();
  for (const row of existingRows) {
    const marker = /\[AB ([0-9a-fA-F-]+)\]/.exec(String(row.remarks ?? ""));
    if (marker) billedClientIds.add(marker[1].toLowerCase());
  }

  const toCreate = dueClients.filter((client) => !billedClientIds.has(client.id.toLowerCase()));
  let sequence = existingRows.length + 1;
  let created = 0;
  const failures: string[] = [];

  for (const client of toCreate) {
    const result = await createBillingEntry(admin, client, today, monthKey, sequence);

    if (result.error) {
      failures.push(`${client.name}: ${result.error}`);
    } else {
      sequence = result.nextSequence;
      created += 1;
    }
  }

  return NextResponse.json({
    created,
    date: today.key,
    due: dueClients.length,
    ...(failures.length ? { failures } : {}),
    skipped: dueClients.length - toCreate.length
  });
}

async function loadAutobillingClients(admin: ReturnType<typeof createAdminClient>) {
  const rows: ClientRow[] = [];

  for (let page = 0; ; page += 1) {
    const result = await admin
      .from("clients")
      .select("id,name,organisation_id,custom_values")
      .eq("custom_values->>source", clientSourceKey)
      .ilike("custom_values->>Autobilling", "yes")
      .order("id", { ascending: true })
      .range(page * fetchBatchSize, page * fetchBatchSize + fetchBatchSize - 1);

    if (result.error) {
      return { error: result.error.message };
    }

    rows.push(...((result.data ?? []) as ClientRow[]));

    if ((result.data?.length ?? 0) < fetchBatchSize) {
      return { rows };
    }
  }
}

async function createBillingEntry(
  admin: ReturnType<typeof createAdminClient>,
  client: ClientRow,
  today: { day: number; key: string; month: number; monthName: string; year: number },
  monthKey: string,
  startSequence: number
) {
  const values = client.custom_values ?? {};
  const amount = Number(String(values["Fixed Monthly Amount"] ?? "").replace(/[,\s₹]/g, ""));

  if (!(amount > 0)) {
    return { error: "No fixed monthly amount on the client record.", nextSequence: startSequence };
  }

  let sequence = startSequence;

  const now = new Date().toISOString();
  let record: Record<string, unknown> = {
    address: text(values.Address),
    amount,
    billing_status: "Draft",
    cgst: 0,
    client: text(values.Particulars) || client.name,
    cost_center: "",
    description: `Monthly retainer bill for ${today.monthName} ${today.year} (autobilling)`,
    escalation_1: "",
    group_name: text(values.Group),
    gstin: text(values["GSTIN/UIN"]),
    igst: 0,
    include_ope_in_fees: false,
    income_head: "",
    invoice_date: null,
    invoice_no: "",
    is_retainer: "Yes",
    memo_date: null,
    memo_no: "",
    ope: 0,
    ope_remarks: "",
    organisation_code: defaultOrganisationCode,
    organisation_id: client.organisation_id,
    owner_team: "",
    place_of_supply: text(values.State),
    poc_email: text(values["Email ID"]),
    poc_mobile: text(values["POC Contact no."]),
    poc_name: text(values["POC Name"]),
    receiving_date: null,
    receiving_status: "Pending",
    registration_type: text(values["Registration Type"]),
    remarks: `Created automatically on billing day ${today.day}. [AB ${client.id}]`,
    serial_no: 0,
    sgst: 0,
    source_module: "autobilling",
    task_code: autobillingCode(monthKey, sequence),
    total: amount,
    updated_at: now,
    voucher_type: "Proforma Invoice"
  };

  // Serial numbers are unique across the whole table, so take the table-wide
  // max and retry a clash with a fresh number, as the billing API does. A
  // clash on the RAB code means another run took that sequence number, so
  // move to the next one and retry.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    record = {
      ...record,
      serial_no: (await nextTableSerial(admin)) + attempt,
      task_code: autobillingCode(monthKey, sequence)
    };
    const inserted = await admin.from(billingTableName).insert(record);

    if (!inserted.error) {
      return { error: null, nextSequence: sequence + 1 };
    }

    const message = String(inserted.error.message ?? "");
    const missingColumn = /column "([^"]+)"/i.exec(message);

    if (missingColumn && /does not exist|schema cache/i.test(message)) {
      // Older databases may lack an optional column: drop it and retry.
      const next = { ...record };
      delete next[missingColumn[1]];
      record = next;
      continue;
    }

    const isDuplicate = inserted.error.code === "23505" || /duplicate key value/i.test(message);

    if (isDuplicate && /task_code/i.test(message)) {
      sequence += 1;
      continue;
    }

    if (!(isDuplicate && /serial_no/i.test(message))) {
      return { error: message, nextSequence: sequence };
    }
  }

  return { error: "Could not assign a serial number.", nextSequence: sequence };
}

async function nextTableSerial(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from(billingTableName)
    .select("serial_no")
    .order("serial_no", { ascending: false, nullsFirst: false })
    .limit(1);

  return Number((data?.[0] as { serial_no?: number } | undefined)?.serial_no ?? 0) + 1;
}

// RAB = Retainer Auto Billing: RAB-202602-01, RAB-202602-02, ... per month.
function autobillingCode(monthKey: string, sequence: number) {
  return `RAB-${monthKey}-${String(sequence).padStart(2, "0")}`;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function indiaToday() {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();

  return {
    day,
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    month,
    monthName: now.toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
    year
  };
}

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
    throw new Error("Autobilling service is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
