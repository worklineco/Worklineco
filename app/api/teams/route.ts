import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type TeamMember = {
  designation: string;
  email: string;
  id: string;
  joining_date: string;
  name: string;
  team: string;
};

const fallbackOrganisationId = "DCO1433";

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Team service is not configured." }, { status: 500 });
  }

  const organisationId =
    String(auth.user.user_metadata?.organisation_id ?? "").trim() || fallbackOrganisationId;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const members: TeamMember[] = [];
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    members.push(
      ...data.users
        .filter((user) => String(user.user_metadata?.organisation_id ?? "").trim() === organisationId)
        .map((user) => {
          const metadata = user.user_metadata ?? {};
          const designation = String(metadata.role ?? metadata.designation ?? "").trim();
          const name = String(metadata.full_name ?? metadata.name ?? "").trim();

          return {
            designation: designation || "-",
            email: user.email ?? "-",
            id: user.id,
            joining_date: String(metadata.joining_date ?? "").trim(),
            name: name || "WorkLine User",
            team: String(metadata.team ?? "").trim()
          };
        })
    );

    if (data.users.length < 1000) {
      break;
    }

    page += 1;
  }

  members.sort((first, second) => first.name.localeCompare(second.name));

  const meMetadata = auth.user.user_metadata ?? {};
  const me = {
    id: auth.user.id,
    name: String(meMetadata.full_name ?? meMetadata.name ?? "").trim(),
    team: String(meMetadata.team ?? "").trim()
  };

  return NextResponse.json({ members, me });
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
