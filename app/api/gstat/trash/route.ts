import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type TrashRow = {
  data: Record<string, string | number>;
  delete_action: string;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name?: string;
  expires_at: string;
  id: string;
  original_appeal_id: string | null;
  original_row_number: number;
};
type AccessScope = {
  isPartner: boolean;
  team: string;
};

const organisationCode = "DCO1433";
const maxRestoreRows = 25;

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const access = getAccessScope(auth.user);
  const { data, error } = await admin
    .from("gstat_deleted_appeals")
    .select("id,original_appeal_id,original_row_number,data,delete_action,deleted_by,deleted_at,expires_at")
    .eq("organisation_code", organisationCode)
    .is("restored_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("deleted_at", { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = filterRowsForAccess((data ?? []) as TrashRow[], access);
  const actorNames = await getActorNames(admin, rows);

  return NextResponse.json({
    rows: rows.map((row) => ({
      ...row,
      deleted_by_name: row.deleted_by ? actorNames[row.deleted_by] ?? row.deleted_by : "-"
    }))
  });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const { trashIds } = (await request.json()) as { trashIds?: string[] };
  const ids = Array.from(new Set((trashIds ?? []).filter((id) => typeof id === "string" && id)));

  if (!ids.length) {
    return NextResponse.json({ error: "Select at least one deleted GSTAT row to restore." }, { status: 400 });
  }

  if (ids.length > maxRestoreRows) {
    return NextResponse.json({ error: `Restore at most ${maxRestoreRows} GSTAT rows at once.` }, { status: 400 });
  }

  const admin = createAdminClient();
  const access = getAccessScope(auth.user);
  const { data, error } = await admin
    .from("gstat_deleted_appeals")
    .select("id,original_appeal_id,original_row_number,data,delete_action,deleted_by,deleted_at,expires_at")
    .eq("organisation_code", organisationCode)
    .is("restored_at", null)
    .gt("expires_at", new Date().toISOString())
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = filterRowsForAccess((data ?? []) as TrashRow[], access);

  if (!rows.length) {
    return NextResponse.json({ error: "No restorable GSTAT rows found." }, { status: 404 });
  }

  const nextRowNumber = await getNextRowNumber(admin);
  const insertRows = rows.map((row, index) => ({
    created_by: auth.user.id,
    data: { ...(row.data ?? {}), Sno: nextRowNumber + index },
    organisation_code: organisationCode,
    row_number: nextRowNumber + index,
    updated_by: auth.user.id
  }));
  const inserted = await admin.from("gstat_appeals").insert(insertRows).select("id,row_number,data,updated_at");

  if (inserted.error) {
    return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  }

  const restoredAt = new Date().toISOString();
  const restored = await admin
    .from("gstat_deleted_appeals")
    .update({ restored_at: restoredAt, restored_by: auth.user.id })
    .in("id", rows.map((row) => row.id));

  if (restored.error) {
    return NextResponse.json({ error: restored.error.message }, { status: 500 });
  }

  await admin.from("gstat_audit_logs").insert({
    action: "restore",
    actor_user_id: auth.user.id,
    field_name: "restore",
    new_value: { row_count: rows.length },
    old_value: null,
    organisation_code: organisationCode
  });

  return NextResponse.json({ restored: inserted.data ?? [] });
}

function filterRowsForAccess<T extends TrashRow>(rows: T[], access: AccessScope) {
  if (access.isPartner || !access.team) {
    return rows;
  }

  return rows.filter((row) => String(row.data?.["Person handling"] ?? "") === access.team);
}

function getAccessScope(user: { user_metadata?: Record<string, unknown> }): AccessScope {
  const role = String(user.user_metadata?.role ?? "").trim().toLowerCase();
  const team = String(user.user_metadata?.team ?? "").trim();

  return {
    isPartner: role === "partner",
    team
  };
}

async function getNextRowNumber(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin
    .from("gstat_appeals")
    .select("row_number")
    .eq("organisation_code", organisationCode)
    .order("row_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.row_number ?? 0) + 1;
}

async function getActorNames(admin: ReturnType<typeof createAdminClient>, rows: TrashRow[]) {
  const actorIds = Array.from(new Set(rows.map((row) => row.deleted_by).filter(Boolean))) as string[];
  const actorNames: Record<string, string> = {};

  await Promise.all(
    actorIds.map(async (actorId) => {
      const { data } = await admin.auth.admin.getUserById(actorId);
      const metadata = data.user?.user_metadata ?? {};
      actorNames[actorId] =
        String(metadata.name ?? metadata.full_name ?? metadata.email ?? data.user?.email ?? actorId).trim() || actorId;
    })
  );

  return actorNames;
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
