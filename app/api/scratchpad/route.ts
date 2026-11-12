import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { normalizeTeam, readUserTeams } from "@/lib/user-teams";

type CookieToSet = { name: string; options: CookieOptions; value: string };

const defaultOrganisationCode = "DCO1433";
// The scratchpad reuses the saved-views table under a reserved name, so no
// new table is needed; the views API hides this reserved row from its lists.
const scratchpadViewName = "__scratchpad__";
// Accounts that may read the team's scratchpads besides Partner-role users.
const extraScratchpadViewers = ["shuchis.dco@gmail.com"];
// Viewers listed here see only these teams' scratchpads (whatever their
// role); viewers not listed see every team.
const viewerTeamScope: Record<string, string[]> = {
  "shuchis.dco@gmail.com": ["Team 03"]
};

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

  const wantsTeam = new URL(request.url).searchParams.get("team") === "1";

  if (!wantsTeam) {
    const { data, error } = await admin
      .from("taskline_views")
      .select("config")
      .eq("organisation_id", organisation.organisationId)
      .eq("user_id", auth.user.id)
      .eq("name", scratchpadViewName)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const config = (data?.config ?? null) as { notes?: unknown; updatedAt?: unknown } | null;
    return NextResponse.json({
      notes: Array.isArray(config?.notes) ? config?.notes : null,
      updatedAt: text(config?.updatedAt)
    });
  }

  const role = text(auth.user.app_metadata?.workline_role).toLowerCase();
  const email = text(auth.user.email).toLowerCase();

  if (!role.includes("partner") && !extraScratchpadViewers.includes(email)) {
    return NextResponse.json({ error: "Only partners can view team scratchpads." }, { status: 403 });
  }

  const { data, error } = await admin
    .from("taskline_views")
    .select("user_id,config")
    .eq("organisation_id", organisation.organisationId)
    .eq("name", scratchpadViewName);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const members = await Promise.all(
    ((data ?? []) as Array<{ config?: unknown; user_id?: string }>).map(async (row) => {
      const userId = String(row.user_id ?? "");
      const config = (row.config ?? {}) as { notes?: unknown; updatedAt?: unknown };
      const { data: target } = await admin.auth.admin.getUserById(userId);
      const metadata = target?.user?.user_metadata ?? {};

      return {
        designation: text(metadata.role ?? metadata.designation),
        email: text(target?.user?.email),
        name: text(metadata.full_name ?? metadata.name) || text(target?.user?.email) || "WorkLine User",
        notes: Array.isArray(config.notes) ? config.notes : [],
        teams: readUserTeams(target?.user ?? null),
        updatedAt: text(config.updatedAt),
        userId
      };
    })
  );

  const scope = viewerTeamScope[email] ?? [];
  const scopedMembers = scope.length
    ? members.filter((member) =>
        member.teams.some((team) => scope.some((allowed) => normalizeTeam(allowed) === normalizeTeam(team)))
      )
    : members;

  scopedMembers.sort((first, second) => first.name.localeCompare(second.name));
  return NextResponse.json({ members: scopedMembers });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => ({}))) as { notes?: unknown };

  if (!Array.isArray(payload.notes)) {
    return NextResponse.json({ error: "Notes are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);
  if ("error" in organisation) {
    return organisation.error;
  }

  const config = { notes: payload.notes, updatedAt: new Date().toISOString() };
  const existing = await admin
    .from("taskline_views")
    .select("id")
    .eq("organisation_id", organisation.organisationId)
    .eq("user_id", auth.user.id)
    .eq("name", scratchpadViewName)
    .maybeSingle();

  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  const saved = existing.data?.id
    ? await admin.from("taskline_views").update({ config }).eq("id", existing.data.id)
    : await admin.from("taskline_views").insert({
        config,
        is_default: false,
        name: scratchpadViewName,
        organisation_id: organisation.organisationId,
        user_id: auth.user.id
      });

  if (saved.error) {
    return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updatedAt: config.updatedAt });
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Scratchpad service is not configured.");
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
