import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isViewOnlyRegisterUser, viewOnlyRegisterResponse } from "@/lib/register-access";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type StoredOverride = { column?: string; row_key?: string; source?: string; value?: string };

const defaultOrganisationCode = "DCO1433";
const sourceKey = "gstr_9_9c_override";
const allowedColumns = new Set([
  "Group",
  "GSTIN",
  "Client Name",
  "State",
  "Allocation for FY 2025-26",
  "Team Allocation",
  "Resource Name",
  "Target Date",
  "Status",
  "Whether GSTR-9 applicable",
  "Whether GSTR-9C applicable",
  "Remarks"
]);

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) return organisation.error;

  const { data, error } = await admin
    .from("clients")
    .select("custom_values")
    .eq("organisation_id", organisation.organisationId)
    .eq("custom_values->>source", sourceKey);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const overrides = (data ?? []).map((item) => item.custom_values as StoredOverride).filter(Boolean);
  return NextResponse.json({ overrides });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (isViewOnlyRegisterUser(auth.user)) return viewOnlyRegisterResponse("GSTR - 9 9C");

  const payload = (await request.json()) as { column?: unknown; rowKey?: unknown; value?: unknown };
  const column = String(payload.column ?? "").trim();
  const rowKey = String(payload.rowKey ?? "").trim();
  const value = String(payload.value ?? "").trim();

  if (!allowedColumns.has(column) || !/^row-\d+$/.test(rowKey)) {
    return NextResponse.json({ error: "Invalid GSTR - 9 9C cell." }, { status: 400 });
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) return organisation.error;

  const existing = await admin
    .from("clients")
    .select("id")
    .eq("organisation_id", organisation.organisationId)
    .eq("custom_values->>source", sourceKey)
    .eq("custom_values->>row_key", rowKey)
    .eq("custom_values->>column", column)
    .maybeSingle();

  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });

  const customValues: StoredOverride = { column, row_key: rowKey, source: sourceKey, value };
  const saved = existing.data?.id
    ? await admin.from("clients").update({ custom_values: customValues, name: `${rowKey}: ${column}` }).eq("id", existing.data.id)
    : await admin.from("clients").insert({
        created_by: auth.user.id,
        custom_values: customValues,
        name: `${rowKey}: ${column}`,
        organisation_id: organisation.organisationId
      });

  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  return NextResponse.json({ override: customValues });
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("GSTR - 9 9C service is not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getOrganisationId(admin: ReturnType<typeof createAdminClient>, user: User) {
  const current = await admin.from("users").select("organisation_id").eq("id", user.id).single();
  if (!current.error && current.data?.organisation_id) return { organisationId: current.data.organisation_id as string };

  const organisationCode = String(user.user_metadata?.organisation_id ?? "").trim() || defaultOrganisationCode;
  const slug = organisationCode.toLowerCase();
  const existing = await admin.from("organisations").select("id").eq("slug", slug).maybeSingle();
  if (existing.error) return { error: NextResponse.json({ error: existing.error.message }, { status: 500 }) };

  let organisationId = existing.data?.id as string | undefined;
  if (!organisationId) {
    const created = await admin.from("organisations").insert({ name: organisationCode === defaultOrganisationCode ? "WorkLine DCO" : organisationCode, slug, status: "trial" }).select("id").single();
    if (created.error) return { error: NextResponse.json({ error: created.error.message }, { status: 500 }) };
    organisationId = created.data.id as string;
  }

  const userResult = await admin.from("users").upsert({
    email: user.email ?? "",
    full_name: String(user.user_metadata?.full_name ?? "").trim() || null,
    id: user.id,
    organisation_id: organisationId,
    status: "active"
  });
  if (userResult.error) return { error: NextResponse.json({ error: userResult.error.message }, { status: 500 }) };
  return { organisationId };
}

async function requireUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet: CookieToSet[]) { cookiesToSet.forEach(({ name, options, value }) => cookieStore.set(name, value, options)); }
    }
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  return { user };
}
