import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type AuditLog = {
  action: string;
  actor_user_id: string | null;
  appeal?: { data?: Record<string, string | number>; row_number?: number } | null;
  appeal_id: string | null;
  created_at: string;
  field_name: string | null;
  id: string;
  new_value: Record<string, string | number> | string | number | null;
  old_value: Record<string, string | number> | string | number | null;
};
type AccessScope = {
  isPartner: boolean;
  team: string;
};

const organisationCode = "DCO1433";

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const access = getAccessScope(auth.user);
  const { data, error } = await admin
    .from("gstat_audit_logs")
    .select("id,appeal_id,actor_user_id,action,field_name,old_value,new_value,created_at,appeal:gstat_appeals(row_number,data)")
    .eq("organisation_code", organisationCode)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: filterLogsForAccess((data ?? []) as AuditLog[], access) });
}

function filterLogsForAccess(logs: AuditLog[], access: AccessScope) {
  if (access.isPartner || !access.team) {
    return logs;
  }

  return logs.filter((log) => {
    const appealTeam = String(log.appeal?.data?.["Person handling"] ?? "");
    const oldTeam = valueTeam(log.old_value);
    const newTeam = valueTeam(log.new_value);

    return [appealTeam, oldTeam, newTeam].includes(access.team);
  });
}

function valueTeam(value: AuditLog["new_value"]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  return String(value["Person handling"] ?? "");
}

function getAccessScope(user: { user_metadata?: Record<string, unknown> }): AccessScope {
  const role = String(user.user_metadata?.role ?? "").trim().toLowerCase();
  const team = String(user.user_metadata?.team ?? "").trim();

  return {
    isPartner: role === "partner",
    team
  };
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
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
