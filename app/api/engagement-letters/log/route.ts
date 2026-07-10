import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type EngagementLetterLogRecord = {
  approval_status?: string;
  date?: string;
  el_no?: string;
  entity_name?: string;
  id?: string;
  nature_of_assignment?: string;
  signed_el_link?: string;
  team_number?: string;
};

const organisationCode = "DCO1433";

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const records = await admin
    .from("engagement_letter_log")
    .select("*")
    .eq("organisation_code", organisationCode)
    .order("generated_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (records.error) {
    return NextResponse.json({ error: records.error.message }, { status: 500 });
  }

  return NextResponse.json({ records: records.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const { record } = (await request.json()) as { record?: EngagementLetterLogRecord };

  if (!record) {
    return NextResponse.json({ error: "Engagement letter log record is required." }, { status: 400 });
  }

  const payload = {
    approval_status: text(record.approval_status) || "Pending",
    el_no: text(record.el_no),
    entity_name: text(record.entity_name),
    generated_date: text(record.date) || new Date().toISOString().slice(0, 10),
    nature_of_assignment: text(record.nature_of_assignment),
    organisation_code: organisationCode,
    signed_el_link: text(record.signed_el_link),
    team_number: text(record.team_number),
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id
  };

  if (!payload.el_no || !payload.entity_name || !payload.nature_of_assignment || !payload.team_number) {
    return NextResponse.json({ error: "EL No., entity, assignment, and team are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const saved = await admin
    .from("engagement_letter_log")
    .upsert({ ...payload, created_by: auth.user.id, id: text(record.id) || undefined }, { onConflict: "id" })
    .select("*")
    .single();

  if (saved.error) {
    return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }

  return NextResponse.json({ record: saved.data });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Engagement letter log service is not configured.");
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
