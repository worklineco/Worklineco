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
  leaving_date: string;
  name: string;
  team: string;
};

const editorRoles = ["partner", "others"];

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
            leaving_date: String(metadata.leaving_date ?? "").trim(),
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
    role: String(meMetadata.role ?? meMetadata.designation ?? "").trim(),
    team: String(meMetadata.team ?? "").trim()
  };

  return NextResponse.json({ members, me });
}

export async function PATCH(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Team service is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    designation?: string;
    id?: string;
    joining_date?: string;
    leaving_date?: string;
    name?: string;
    team?: string;
  };

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Member id is required." }, { status: 400 });
  }

  const requesterRole = String(auth.user.user_metadata?.role ?? auth.user.user_metadata?.designation ?? "")
    .trim()
    .toLowerCase();
  if (!editorRoles.includes(requesterRole)) {
    return NextResponse.json(
      { error: "Only Partner or Others roles can edit team members." },
      { status: 403 }
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: target, error: fetchError } = await admin.auth.admin.getUserById(id);
  if (fetchError || !target?.user) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const requesterOrg =
    String(auth.user.user_metadata?.organisation_id ?? "").trim() || fallbackOrganisationId;
  const targetOrg =
    String(target.user.user_metadata?.organisation_id ?? "").trim() || fallbackOrganisationId;

  if (requesterOrg !== targetOrg) {
    return NextResponse.json(
      { error: "You can only edit members in your organisation." },
      { status: 403 }
    );
  }

  const nextMetadata: Record<string, unknown> = { ...(target.user.user_metadata ?? {}) };

  if (body.name !== undefined) {
    nextMetadata.full_name = String(body.name).trim();
  }
  if (body.team !== undefined) {
    nextMetadata.team = String(body.team).trim();
  }
  if (body.designation !== undefined) {
    const designation = String(body.designation).trim();
    nextMetadata.role = designation;
    nextMetadata.designation = designation;
  }
  if (body.joining_date !== undefined) {
    nextMetadata.joining_date = String(body.joining_date).trim();
  }
  if (body.leaving_date !== undefined) {
    nextMetadata.leaving_date = String(body.leaving_date).trim();
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(id, {
    user_metadata: nextMetadata
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
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
