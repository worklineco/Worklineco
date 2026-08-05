import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type SavedView = { config: Record<string, unknown>; id: string; name: string };

const defaultOrganisationCode = "DCO1433";
const viewsSqlFile = "database/019_taskline_views.sql";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }

  return listViews(admin, organisation.organisationId, auth.user.id);
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => ({}))) as {
    config?: Record<string, unknown>;
    id?: string;
    name?: string;
  };

  const name = text(payload.name);
  if (!name) {
    return NextResponse.json({ error: "View name is required." }, { status: 400 });
  }

  const config = payload.config && typeof payload.config === "object" ? payload.config : {};

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }

  const id = text(payload.id);
  const now = new Date().toISOString();

  if (id) {
    const updated = await admin
      .from("taskline_views")
      .update({ config, name, updated_at: now })
      .eq("id", id)
      .eq("organisation_id", organisation.organisationId)
      .eq("user_id", auth.user.id);
    if (updated.error) {
      return errorResponse(updated.error);
    }
  } else {
    const upserted = await admin
      .from("taskline_views")
      .upsert(
        { config, name, organisation_id: organisation.organisationId, updated_at: now, user_id: auth.user.id },
        { onConflict: "organisation_id,user_id,name" }
      );
    if (upserted.error) {
      return errorResponse(upserted.error);
    }
  }

  return listViews(admin, organisation.organisationId, auth.user.id);
}

export async function DELETE(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "View id is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }

  const deleted = await admin
    .from("taskline_views")
    .delete()
    .eq("id", id)
    .eq("organisation_id", organisation.organisationId)
    .eq("user_id", auth.user.id);
  if (deleted.error) {
    return errorResponse(deleted.error);
  }

  return listViews(admin, organisation.organisationId, auth.user.id);
}

async function listViews(admin: ReturnType<typeof createAdminClient>, organisationId: string, userId: string) {
  const { data, error } = await admin
    .from("taskline_views")
    .select("id,name,config")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) {
    return errorResponse(error);
  }

  return NextResponse.json({ views: (data ?? []) as SavedView[] });
}

function errorResponse(error: { message: string }) {
  const setupRequired =
    error.message.toLowerCase().includes("does not exist") ||
    error.message.toLowerCase().includes("could not find the table");
  return NextResponse.json(
    {
      error: setupRequired ? `Saved views table is not set up yet. Run ${viewsSqlFile} in Supabase.` : error.message,
      setupRequired
    },
    { status: setupRequired ? 400 : 500 }
  );
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Saved views service is not configured.");
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
  const existingOrganisation = await admin
    .from("organisations")
    .select("id")
    .eq("slug", organisationCode.toLowerCase())
    .maybeSingle();

  if (existingOrganisation.error) {
    return { error: NextResponse.json({ error: existingOrganisation.error.message }, { status: 500 }) };
  }

  const organisationId = existingOrganisation.data?.id;
  if (!organisationId) {
    return { error: NextResponse.json({ error: "Could not resolve organisation." }, { status: 500 }) };
  }

  return { organisationId };
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

function text(value: unknown) {
  return String(value ?? "").trim();
}
