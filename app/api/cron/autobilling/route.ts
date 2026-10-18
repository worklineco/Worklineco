import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Autobilling: retainer clients whose record sets Autobilling = Yes get a
// billing entry automatically every month on their chosen billing day. When a
// month is shorter than the chosen day (the 31st in February, say), the entry
// is created on that month's last day. Entries carry a deterministic
// task_code (AB-YYYYMM-<client>) so a re-run or overlapping run can never
// create the same month's bill twice.

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

  // One month, one bill: skip clients whose entry for this month exists.
  const monthKey = `${today.year}${String(today.month).padStart(2, "0")}`;
  const codes = dueClients.map((client) => autobillingCode(monthKey, client.id));
  const existing = await admin.from(billingTableName).select("task_code").in("task_code", codes);

  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  const existingCodes = new Set((existing.data ?? []).map((row) => String((row as { task_code?: string }).task_code ?? "")));
  const toCreate = dueClients.filter((client) => !existingCodes.has(autobillingCode(monthKey, client.id)));
  let created = 0;
  const failures: string[] = [];

  for (const client of toCreate) {
    const result = await createBillingEntry(admin, client, today, monthKey);

    if (result.error) {
      failures.push(`${client.name}: ${result.error}`);
    } else {
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
  monthKey: string
) {
  const values = client.custom_values ?? {};
  const amount = Number(String(values["Fixed Monthly Amount"] ?? "").replace(/[,\s₹]/g, ""));

  if (!(amount > 0)) {
    return { error: "No fixed monthly amount on the client record." };
  }

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
    remarks: `Created automatically on billing day ${today.day}.`,
    serial_no: 0,
    sgst: 0,
    source_module: "autobilling",
    task_code: autobillingCode(monthKey, client.id),
    total: amount,
    updated_at: now,
    voucher_type: "Proforma Invoice"
  };

  // Serial numbers are unique across the whole table, so take the table-wide
  // max and retry a clash with a fresh number, as the billing API does.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    record = { ...record, serial_no: (await nextTableSerial(admin)) + attempt };
    const inserted = await admin.from(billingTableName).insert(record);

    if (!inserted.error) {
      return { error: null };
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

    const isDuplicateSerial = (inserted.error.code === "23505" || /duplicate key value/i.test(message)) && /serial_no/i.test(message);

    if (!isDuplicateSerial) {
      // A duplicate task_code means another run created this month's bill
      // between our check and this insert - that is a success, not an error.
      if ((inserted.error.code === "23505" || /duplicate key value/i.test(message)) && /task_code/i.test(message)) {
        return { error: null };
      }
      return { error: message };
    }
  }

  return { error: "Could not assign a serial number." };
}

async function nextTableSerial(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from(billingTableName)
    .select("serial_no")
    .order("serial_no", { ascending: false, nullsFirst: false })
    .limit(1);

  return Number((data?.[0] as { serial_no?: number } | undefined)?.serial_no ?? 0) + 1;
}

function autobillingCode(monthKey: string, clientId: string) {
  return `AB-${monthKey}-${clientId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
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
