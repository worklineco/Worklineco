import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type BillingRecord = {
  billing_status?: string;
  cgst?: number | string;
  client?: string;
  gstin?: string;
  gstat_appeal_id?: string;
  id?: string;
  igst?: number | string;
  invoice_date?: string;
  invoice_number?: string;
  matter_description?: string;
  payment_date?: string;
  payment_status?: string;
  professional_fee?: number | string;
  remarks?: string;
  sgst?: number | string;
  total?: number | string;
};
type GstatMatter = {
  data: Record<string, string | number>;
  id: string;
  row_number: number;
};

const organisationCode = "DCO1433";

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const matters = await admin
    .from("gstat_appeals")
    .select("id,row_number,data")
    .eq("organisation_code", organisationCode)
    .order("row_number", { ascending: true });

  if (matters.error) {
    return NextResponse.json({ error: matters.error.message }, { status: 500 });
  }

  const records = await admin
    .from("gstat_billing_records")
    .select("*")
    .eq("organisation_code", organisationCode)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (records.error) {
    return NextResponse.json({ error: records.error.message }, { status: 500 });
  }

  return NextResponse.json({
    matters: (matters.data ?? []).map(formatMatter),
    records: records.data ?? []
  });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const { record } = (await request.json()) as { record?: BillingRecord };

  if (!record) {
    return NextResponse.json({ error: "Billing record is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const cleaned = cleanRecord(record);

  if (!cleaned.client && !cleaned.gstat_appeal_id && !cleaned.invoice_number) {
    return NextResponse.json({ error: "Select a GSTAT matter or enter billing details." }, { status: 400 });
  }

  const payload = {
    ...cleaned,
    organisation_code: organisationCode,
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id
  };
  const saved = record.id
    ? await admin
        .from("gstat_billing_records")
        .update(payload)
        .eq("id", record.id)
        .eq("organisation_code", organisationCode)
        .select("*")
        .single()
    : await admin
        .from("gstat_billing_records")
        .insert({ ...payload, created_by: auth.user.id })
        .select("*")
        .single();

  if (saved.error) {
    return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }

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
  const { error } = await admin
    .from("gstat_billing_records")
    .delete()
    .eq("id", id)
    .eq("organisation_code", organisationCode);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function cleanRecord(record: BillingRecord) {
  const professionalFee = toNumber(record.professional_fee);
  const cgst = toNumber(record.cgst);
  const sgst = toNumber(record.sgst);
  const igst = toNumber(record.igst);
  const explicitTotal = toNumber(record.total);
  const total = explicitTotal || professionalFee + cgst + sgst + igst;

  return {
    billing_status: text(record.billing_status) || "Draft",
    cgst,
    client: text(record.client),
    gstin: text(record.gstin),
    gstat_appeal_id: text(record.gstat_appeal_id) || null,
    igst,
    invoice_date: text(record.invoice_date) || null,
    invoice_number: text(record.invoice_number),
    matter_description: text(record.matter_description),
    payment_date: text(record.payment_date) || null,
    payment_status: text(record.payment_status) || "Unpaid",
    professional_fee: professionalFee,
    remarks: text(record.remarks),
    sgst,
    total
  };
}

function formatMatter(matter: GstatMatter) {
  const data = matter.data ?? {};
  const entity = text(data["Entity Name"]);
  const appellant = text(data.Appellant);
  const oia = text(data["OIA No"]);
  const drc = text(data["DRC 07 No"]);

  return {
    client: entity || appellant,
    gstin: "",
    id: matter.id,
    label: [`#${matter.row_number}`, entity || appellant || "GSTAT matter", oia || drc].filter(Boolean).join(" - "),
    matter_description: text(data["Issue in brief"]) || text(data.Remark),
    row_number: matter.row_number
  };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
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
