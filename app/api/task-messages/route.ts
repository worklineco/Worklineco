import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };

const defaultOrganisationCode = "DCO1433";

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
  const code = text(new URL(request.url).searchParams.get("code"));
  if (!code) {
    return NextResponse.json({ messages: [] });
  }
  const access = getAccess(auth.user);
  let query = admin
    .from("task_messages")
    .select("id,task_code,team,author_name,body,created_at")
    .eq("organisation_id", organisation.organisationId)
    .eq("task_code", code)
    .order("created_at", { ascending: true });
  if (!access.canViewAll && access.team) {
    query = query.eq("team", access.team);
  }
  const { data, error } = await query;
  if (error) {
    return errorResponse(error);
  }
  return NextResponse.json({ messages: data ?? [] });
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
  const payload = (await request.json()) as { body?: string; code?: string; team?: string };
  const code = text(payload.code);
  const body = text(payload.body);
  if (!code || !body) {
    return NextResponse.json({ error: "Task code and message are required." }, { status: 400 });
  }
  const metadata = auth.user.user_metadata ?? {};
  const authorName = text(metadata.full_name ?? metadata.name ?? auth.user.email) || "WorkLine user";
  const inserted = await admin.from("task_messages").insert({
    author_id: auth.user.id,
    author_name: authorName,
    body,
    organisation_id: organisation.organisationId,
    task_code: code,
    team: text(payload.team)
  });
  if (inserted.error) {
    return errorResponse(inserted.error);
  }
  return NextResponse.json({ ok: true });
}

function errorResponse(error: { message: string }) {
  const setupRequired =
    error.message.toLowerCase().includes("does not exist") ||
    error.message.toLowerCase().includes("could not find the table");
  return NextResponse.json(
    {
      error: setupRequired ? "Task messages table is not set up yet. Run database/018_task_messages.sql in Supabase." : error.message,
      setupRequired
    },
    { status: setupRequired ? 400 : 500 }
  );
}

function getAccess(user: User) {
  const role = text(user.user_metadata?.role).toLowerCase();
  const team = text(user.user_metadata?.team);
  const canViewAll = role.includes("partner") || role === "owner" || role === "admin";
  return { canViewAll, team };
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Task messages service is not configured.");
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
