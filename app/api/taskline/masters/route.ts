import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type TaskMaster = { id: string; name: string };

const defaultOrganisationCode = "DCO1433";

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

  return listMasters(admin, organisation.organisationId);
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const payload = (await request.json()) as { id?: string; name?: string; names?: string[] };

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }

  if (Array.isArray(payload.names)) {
    const unique = Array.from(new Set(payload.names.map((value) => text(value)).filter(Boolean)));
    if (unique.length) {
      const inserted = await admin
        .from("taskline_task_master")
        .upsert(unique.map((name) => ({ name, organisation_id: organisation.organisationId })), {
          ignoreDuplicates: true,
          onConflict: "organisation_id,name"
        });
      if (inserted.error) {
        return errorResponse(inserted.error);
      }
    }
    return listMasters(admin, organisation.organisationId);
  }

  const name = text(payload.name);

  if (!name) {
    return NextResponse.json({ error: "Task name is required." }, { status: 400 });
  }

  const id = text(payload.id);

  if (id) {
    const updated = await admin
      .from("taskline_task_master")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organisation_id", organisation.organisationId);
    if (updated.error) {
      return errorResponse(updated.error);
    }
  } else {
    const inserted = await admin
      .from("taskline_task_master")
      .insert({ name, organisation_id: organisation.organisationId });
    if (inserted.error && !inserted.error.message.toLowerCase().includes("duplicate")) {
      return errorResponse(inserted.error);
    }
  }

  return listMasters(admin, organisation.organisationId);
}

export async function DELETE(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Task id is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }

  const deleted = await admin
    .from("taskline_task_master")
    .delete()
    .eq("id", id)
    .eq("organisation_id", organisation.organisationId);
  if (deleted.error) {
    return errorResponse(deleted.error);
  }

  return listMasters(admin, organisation.organisationId);
}

async function listMasters(admin: ReturnType<typeof createAdminClient>, organisationId: string) {
  const { data, error } = await admin
    .from("taskline_task_master")
    .select("id,name")
    .eq("organisation_id", organisationId)
    .order("name", { ascending: true });

  if (error) {
    return errorResponse(error);
  }

  return NextResponse.json({ masters: (data ?? []) as TaskMaster[] });
}

function errorResponse(error: { message: string }) {
  const setupRequired =
    error.message.toLowerCase().includes("does not exist") ||
    error.message.toLowerCase().includes("could not find the table");
  return NextResponse.json(
    {
      error: setupRequired
        ? "Task master table is not set up yet. Run database/013_taskline_task_master.sql in Supabase."
        : error.message,
      setupRequired
    },
    { status: setupRequired ? 400 : 500 }
  );
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Task master service is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function getOrganisationId(admin: ReturnType<typeof createAdminClient>, user: User) {
  const { data, error } = await admin
    .from("users")
    .select("organisation_id")
    .eq("id", user.id)
    .single();

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
