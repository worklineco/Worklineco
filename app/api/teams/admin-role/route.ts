import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };

// Only Senior Managers and Partners can grant or revoke the Admin role.
const granterRoles = ["senior manager", "partner"];

/**
 * Admin Role management.
 *
 * The Admin role can be granted to Article Assistants by Senior Managers and
 * Partners. Authorization is read only from server-managed app metadata.
 * An Article Assistant with the Admin role gets the same editing
 * rights as a Manager on TaskLine, GSTAT, and Client Records - Billing stays
 * out of reach for every Article Assistant, Admin or not.
 *
 * GET  -> list Article Assistants in the organisation with their admin flag
 * POST -> { adminIds: string[] } sets the admin flag: listed articles get it,
 *         every other article loses it (multiple people supported)
 */

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const requesterRole = String(auth.user.app_metadata?.workline_role ?? "").trim().toLowerCase();
  if (!granterRoles.includes(requesterRole)) {
    return NextResponse.json({ error: "Only Senior Managers and Partners can manage the Admin role." }, { status: 403 });
  }

  const admin = createAdminClient();
  if ("error" in admin) {
    return admin.error;
  }

  const articles = await listOrganisationArticles(admin.client, organisationCode(auth.user));
  if ("error" in articles) {
    return NextResponse.json({ error: articles.error }, { status: 500 });
  }

  return NextResponse.json({
    articles: articles.users.map((user) => ({
      email: user.email ?? "",
      id: user.id,
      isAdmin: user.app_metadata?.workline_admin === true,
      name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim() || user.email || "WorkLine User",
      team: String(user.user_metadata?.team ?? "").trim()
    }))
  });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const requesterRole = String(auth.user.app_metadata?.workline_role ?? "").trim().toLowerCase();
  if (!granterRoles.includes(requesterRole)) {
    return NextResponse.json({ error: "Only Senior Managers and Partners can manage the Admin role." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as { adminIds?: string[] };
  if (!Array.isArray(payload.adminIds)) {
    return NextResponse.json({ error: "adminIds is required." }, { status: 400 });
  }

  const adminIds = new Set(payload.adminIds.filter((id) => typeof id === "string" && id.trim()));
  const admin = createAdminClient();
  if ("error" in admin) {
    return admin.error;
  }

  const articles = await listOrganisationArticles(admin.client, organisationCode(auth.user));
  if ("error" in articles) {
    return NextResponse.json({ error: articles.error }, { status: 500 });
  }

  let granted = 0;
  let revoked = 0;

  for (const user of articles.users) {
    const shouldBeAdmin = adminIds.has(user.id);
    const isAdmin = user.app_metadata?.workline_admin === true;

    if (shouldBeAdmin === isAdmin) {
      continue;
    }

    const updated = await admin.client.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...(user.app_metadata ?? {}),
        workline_admin: shouldBeAdmin
      }
    });

    if (updated.error) {
      return NextResponse.json(
        { error: `Could not update ${user.email ?? user.id}: ${updated.error.message}` },
        { status: 500 }
      );
    }

    if (shouldBeAdmin) {
      granted += 1;
    } else {
      revoked += 1;
    }
  }

  return NextResponse.json({ granted, revoked });
}

function organisationCode(user: User) {
  return String(user.app_metadata?.workline_organisation ?? "").trim();
}

async function listOrganisationArticles(
  admin: NonNullable<Extract<ReturnType<typeof createAdminClient>, { client: unknown }>>["client"],
  organisation: string
) {
  const users: User[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });

    if (result.error) {
      return { error: result.error.message };
    }

    users.push(
      ...result.data.users.filter((user) => {
        const accessMetadata = user.app_metadata ?? {};
        const role = String(accessMetadata.workline_role ?? "").toLowerCase();
        return (
          String(accessMetadata.workline_organisation ?? "").trim() === organisation &&
          role.includes("article")
        );
      })
    );

    if (result.data.users.length < 1000) {
      break;
    }
  }

  users.sort((first, second) =>
    String(first.user_metadata?.full_name ?? "").localeCompare(String(second.user_metadata?.full_name ?? ""))
  );

  return { users };
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "Team service is not configured." }, { status: 500 }) };
  }

  return { client: createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }) };
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
