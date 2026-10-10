import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type ClientCustomValues = Record<string, string | number> | null;

const defaultOrganisationCode = "DCO1433";
const activeSourceKey = "client_records_register";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }
  const organisationId = organisation.organisationId;

  const gstin = text(new URL(request.url).searchParams.get("gstin")).toUpperCase();

  // Clients (for the dropdown) come from Client Records — those with a GSTIN.
  // Supabase caps a single response at 1,000 rows, so page through the whole
  // register with a stable order instead of one capped query.
  const clientRows: { custom_values: unknown; id: string; name: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await admin
      .from("clients")
      .select("id,name,custom_values")
      .eq("organisation_id", organisationId)
      .eq("custom_values->>source", activeSourceKey)
      .order("id", { ascending: true })
      .range(from, from + 999);

    if (page.error) {
      return NextResponse.json({ error: page.error.message }, { status: 500 });
    }

    clientRows.push(...((page.data ?? []) as typeof clientRows));

    if ((page.data ?? []).length < 1000) {
      break;
    }
  }

  const clients = clientRows
    .map((row) => {
      const values = (row.custom_values ?? {}) as ClientCustomValues;
      const data = values ?? {};
      return {
        gstin: text(data["GSTIN/UIN"]).toUpperCase(),
        group: text(data["Group"]),
        hasCredentials: Boolean(text(data["GST-ID"]) && text(data["GST-PASS"])),
        name: text(data["Particulars"]) || text(row.name)
      };
    })
    .filter((client) => client.gstin)
    .sort((a, b) => a.name.localeCompare(b.name));

  // With login=1, also return the stored GST login for the requested GSTIN so
  // the local helper can sign in without any key file on that computer. Only
  // signed-in WorkLine users reach this - the same people who can already see
  // GST-ID / GST-PASS on the Client Records register.
  let login: { clientName: string; password: string; userId: string } | null = null;
  if (gstin && new URL(request.url).searchParams.get("login") === "1") {
    const match = clientRows.find((row) => {
      const values = (row.custom_values ?? {}) as ClientCustomValues;
      const data = values ?? {};
      return text(data["GSTIN/UIN"]).toUpperCase() === gstin;
    });
    if (match) {
      const values = (match.custom_values ?? {}) as ClientCustomValues;
      const data = values ?? {};
      const userId = text(data["GST-ID"]);
      const password = text(data["GST-PASS"]);
      if (userId && password) {
        login = { clientName: text(data["Particulars"]) || text(match.name), password, userId };
      }
    }
  }

  let cases: unknown[] = [];
  let lastScrapedAt: string | null = null;

  if (gstin) {
    const registration = await admin
      .from("gst_registrations")
      .select("id,updated_at")
      .eq("organisation_id", organisationId)
      .eq("gstin", gstin)
      .maybeSingle();

    if (registration.error) {
      return NextResponse.json({ error: registration.error.message }, { status: 500 });
    }

    if (registration.data?.id) {
      const casesResult = await admin
        .from("gst_litigation_cases")
        .select("id,serial_no,notice_type,description,ref_id,date_of_issue,case_id,status,tax_period,due_date,section,reply_filing_status,source,scraped_at,raw_payload")
        .eq("organisation_id", organisationId)
        .eq("gst_registration_id", registration.data.id)
        .order("date_of_issue", { ascending: false, nullsFirst: false })
        .order("serial_no", { ascending: true });

      if (casesResult.error) {
        return NextResponse.json({ error: casesResult.error.message }, { status: 500 });
      }

      cases = casesResult.data ?? [];
      lastScrapedAt = (cases[0] as { scraped_at?: string } | undefined)?.scraped_at ?? registration.data.updated_at ?? null;
    }
  }

  return NextResponse.json({ cases, clients, lastScrapedAt, login });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }
  const organisationId = organisation.organisationId;

  const payload = (await request.json().catch(() => ({}))) as {
    action?: string;
    clientName?: string;
    case?: Record<string, unknown>;
    extractedAt?: string;
    gstin?: string;
    rows?: unknown[];
    sources?: unknown[];
  };

  const gstin = text(payload.gstin).toUpperCase();
  if (!gstin) {
    return NextResponse.json({ error: "GSTIN is required." }, { status: 400 });
  }

  // action=sync: the GST Tracker page relays a whole scrape from the local
  // helper. Replace the scraped sources' rows for this GSTIN - the same
  // semantics the collector uses when it writes to the database directly -
  // so the helper itself never needs database keys.
  if (text(payload.action) === "sync") {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const syncRegistrationId = await ensureRegistration(admin, organisationId, gstin, text(payload.clientName) || gstin);
    if (!syncRegistrationId) {
      return NextResponse.json({ error: "Could not prepare the GST registration." }, { status: 500 });
    }

    const sourceTags = Array.from(
      new Set(
        (Array.isArray(payload.sources) && payload.sources.length
          ? payload.sources.map((value) => text(value).toLowerCase())
          : rows.map((row) => text((row as Record<string, unknown>).sourceTab).toLowerCase())
        ).filter(Boolean)
      )
    );

    if (sourceTags.length) {
      const cleared = await admin
        .from("gst_litigation_cases")
        .delete()
        .eq("organisation_id", organisationId)
        .eq("gst_registration_id", syncRegistrationId)
        .in("source", sourceTags);
      if (cleared.error) {
        return NextResponse.json({ error: cleared.error.message }, { status: 500 });
      }
    }

    if (rows.length) {
      const extractedAt = text(payload.extractedAt) || new Date().toISOString();
      const inserted = await admin.from("gst_litigation_cases").insert(
        rows.map((raw, index) => {
          const row = (raw ?? {}) as Record<string, unknown>;
          const normalized = normalizePortalRow(row, index);
          return {
            ...normalized,
            case_id: normalized.case_id || normalized.ref_id || `row-${index + 1}`,
            gst_registration_id: syncRegistrationId,
            organisation_id: organisationId,
            raw_payload: row,
            scraped_at: extractedAt,
            source: text(row.sourceTab) || "gst-portal-local-collector",
            updated_at: new Date().toISOString()
          };
        })
      );
      if (inserted.error) {
        return NextResponse.json({ error: inserted.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, saved: rows.length });
  }

  const registrationId = await ensureRegistration(admin, organisationId, gstin, text(payload.clientName) || gstin);
  if (!registrationId) {
    return NextResponse.json({ error: "Could not prepare the GST registration." }, { status: 500 });
  }

  const source = payload.case ?? {};
  const row = {
    case_id: text(source.case_id) || null,
    date_of_issue: text(source.date_of_issue) || null,
    description: text(source.description) || null,
    due_date: text(source.due_date) || null,
    gst_registration_id: registrationId,
    notice_type: text(source.notice_type) || null,
    organisation_id: organisationId,
    ref_id: text(source.ref_id) || null,
    reply_filing_status: text(source.reply_filing_status) || null,
    section: text(source.section) || null,
    serial_no: Number.isFinite(Number(source.serial_no)) ? Number(source.serial_no) : null,
    source: "manual",
    status: text(source.status) || null,
    tax_period: text(source.tax_period) || null
  };

  const saved = await admin.from("gst_litigation_cases").insert(row);
  if (saved.error) {
    return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }

  const id = text(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "Case id is required." }, { status: 400 });
  }

  const deleted = await admin
    .from("gst_litigation_cases")
    .delete()
    .eq("id", id)
    .eq("organisation_id", organisation.organisationId);

  if (deleted.error) {
    return NextResponse.json({ error: deleted.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function ensureRegistration(admin: ReturnType<typeof createAdminClient>, organisationId: string, gstin: string, clientName: string) {
  const existing = await admin
    .from("gst_registrations")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("gstin", gstin)
    .maybeSingle();

  if (existing.data?.id) {
    return existing.data.id as string;
  }

  const created = await admin
    .from("gst_registrations")
    .insert({ client_name: clientName, gstin, organisation_id: organisationId })
    .select("id")
    .single();

  return created.data?.id ?? null;
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("GST tracker service is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function getOrganisationId(admin: ReturnType<typeof createAdminClient>, user: User) {
  const { data, error } = await admin.from("users").select("organisation_id").eq("id", user.id).single();
  if (!error && data?.organisation_id) {
    return { organisationId: data.organisation_id as string };
  }

  const organisationCode = text(user.user_metadata?.organisation_id) || defaultOrganisationCode;
  const existing = await admin.from("organisations").select("id").eq("slug", organisationCode.toLowerCase()).maybeSingle();
  if (existing.error) {
    return { error: NextResponse.json({ error: existing.error.message }, { status: 500 }) };
  }
  if (!existing.data?.id) {
    return { error: NextResponse.json({ error: "Could not resolve organisation." }, { status: 500 }) };
  }
  return { organisationId: existing.data.id as string };
}

async function requireUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, options, value }) => cookieStore.set(name, value, options));
      }
    }
  });
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  return { user };
}

// Mirrors the collector's row normalization so synced rows look identical to
// ones the collector used to write directly.
function normalizePortalRow(row: Record<string, unknown>, index: number) {
  return {
    case_id: text(row.caseId) || null,
    date_of_issue: parsePortalDate(row.dateOfIssue),
    description: text(row.description) || null,
    due_date: parsePortalDate(row.dueDate),
    notice_type: text(row.typeOfNotice) || null,
    ref_id: text(row.refId) || null,
    reply_filing_status: text(row.replyFiling) || null,
    section: text(row.section) || null,
    serial_no: Number.parseInt(text(row.sNo), 10) || index + 1,
    status: text(row.status) || null,
    tax_period: text(row.taxPeriod) || null
  };
}

function parsePortalDate(value: unknown) {
  const cleaned = text(value).replace(/\s+/g, " ");
  if (!cleaned || ["-", "na", "n/a"].includes(cleaned.toLowerCase())) {
    return null;
  }

  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime()) && /^\d{4}-\d{1,2}-\d{1,2}/.test(cleaned)) {
    return direct.toISOString().slice(0, 10);
  }

  const match = cleaned.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, yearValue] = match;
  const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}
