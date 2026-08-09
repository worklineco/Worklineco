import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isViewOnlyRegisterUser, viewOnlyRegisterResponse } from "@/lib/register-access";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type RegisterRow = Record<string, string | number>;

const defaultOrganisationCode = "DCO1433";
const sourceKey = "client_records_register";
const fetchBatchSize = 1000;
const columns = [
  "S.no.",
  "Group",
  "Particulars",
  "Email ID",
  "POC Name",
  "POC Contact no.",
  "Address",
  "State",
  "Country",
  "Registration Type",
  "GSTIN/UIN",
  "PAN/IT No."
];

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

  const { data, error } = await fetchAllClientRows(admin, organisation.organisationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((client, index) => normalizeClientRow(client, index));

  return NextResponse.json({ rows });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  if (isViewOnlyRegisterUser(auth.user)) {
    return viewOnlyRegisterResponse("Client Records");
  }

  const { rows } = (await request.json()) as { rows?: RegisterRow[] };

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Rows are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const organisation = await getOrganisationId(admin, auth.user);

  if ("error" in organisation) {
    return organisation.error;
  }

  const { error: deleteError } = await admin
    .from("clients")
    .delete()
    .eq("organisation_id", organisation.organisationId)
    .eq("custom_values->>source", sourceKey);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const cleanedRows = rows
    .map((row, index) => normalizeIncomingRow(row, index))
    .filter((row) => columns.some((column) => String(row[column] ?? "").trim()));

  const insertRows = cleanedRows.map((row) => ({
    created_by: auth.user.id,
    custom_values: {
      ...row,
      source: sourceKey
    },
    name: String(row.Particulars ?? "").trim() || `Client ${row["S.no."]}`,
    organisation_id: organisation.organisationId
  }));

  const inserted = insertRows.length
    ? await admin
        .from("clients")
        .insert(insertRows)
    : { data: [], error: null };

  if (inserted.error) {
    return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  }

  const reloaded = await fetchAllClientRows(admin, organisation.organisationId);

  if (reloaded.error) {
    return NextResponse.json({ error: reloaded.error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: (reloaded.data ?? []).map((client, index) => normalizeClientRow(client, index))
  });
}

async function fetchAllClientRows(admin: ReturnType<typeof createAdminClient>, organisationId: string) {
  // Count first, then fetch every 1000-row page in parallel (the previous
  // sequential loop cost one full round-trip per page).
  const counted = await admin
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("custom_values->>source", sourceKey);

  if (counted.error) {
    return { data: null, error: counted.error };
  }

  const total = counted.count ?? 0;
  if (!total) {
    return { data: [] as Array<{ custom_values: RegisterRow | null; name: string }>, error: null };
  }

  const pageCount = Math.ceil(total / fetchBatchSize);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, page) =>
      admin
        .from("clients")
        .select("id,name,custom_values,created_at")
        .eq("organisation_id", organisationId)
        .eq("custom_values->>source", sourceKey)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }) // stable tiebreaker so parallel pages never overlap
        .range(page * fetchBatchSize, page * fetchBatchSize + fetchBatchSize - 1)
    )
  );

  const rows: Array<{ custom_values: RegisterRow | null; name: string }> = [];
  for (const pageResult of pages) {
    if (pageResult.error) {
      return { data: null, error: pageResult.error };
    }
    rows.push(...((pageResult.data ?? []) as Array<{ custom_values: RegisterRow | null; name: string }>));
  }

  return { data: rows, error: null };
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Client records service is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function getOrganisationId(
  admin: ReturnType<typeof createAdminClient>,
  user: User
) {
  const { data, error } = await admin
    .from("users")
    .select("organisation_id")
    .eq("id", user.id)
    .single();

  if (!error && data?.organisation_id) {
    return { organisationId: data.organisation_id as string };
  }

  const organisationCode =
    String(user.user_metadata?.organisation_id ?? "").trim() || defaultOrganisationCode;
  const slug = organisationCode.toLowerCase();
  const organisationName = organisationCode === defaultOrganisationCode ? "WorkLine DCO" : organisationCode;
  const existingOrganisation = await admin
    .from("organisations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingOrganisation.error) {
    return {
      error: NextResponse.json(
        { error: existingOrganisation.error.message },
        { status: 500 }
      )
    };
  }

  const organisationId = existingOrganisation.data?.id ?? await createOrganisation(admin, organisationName, slug);

  if (!organisationId) {
    return {
      error: NextResponse.json(
        { error: "Could not prepare the firm workspace for client records." },
        { status: 500 }
      )
    };
  }

  const { error: userError } = await admin.from("users").upsert({
    email: user.email ?? "",
    full_name: String(user.user_metadata?.full_name ?? "").trim() || null,
    id: user.id,
    organisation_id: organisationId,
    status: "active"
  });

  if (userError) {
    return { error: NextResponse.json({ error: userError.message }, { status: 500 }) };
  }

  return { organisationId };
}

async function createOrganisation(
  admin: ReturnType<typeof createAdminClient>,
  name: string,
  slug: string
) {
  const { data, error } = await admin
    .from("organisations")
    .insert({
      name,
      slug,
      status: "trial"
    })
    .select("id")
    .single();

  if (error) {
    return null;
  }

  return data.id as string;
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

function normalizeClientRow(client: { custom_values: RegisterRow | null; name: string }, index: number) {
  const customValues = client.custom_values ?? {};

  return columns.reduce<RegisterRow>((row, column) => {
    if (column === "Sl No.") {
      row[column] = customValues[column] || index + 1;
    } else if (column === "S.no.") {
      row[column] = customValues[column] || customValues["Sl No."] || index + 1;
    } else if (column === "Particulars") {
      row[column] = customValues[column] || client.name || "";
    } else {
      row[column] = customValues[column] || "";
    }

    return row;
  }, {});
}

function normalizeIncomingRow(row: RegisterRow, index: number) {
  return columns.reduce<RegisterRow>((record, column) => {
    record[column] = column === "S.no." ? row[column] || row["Sl No."] || index + 1 : row[column] ?? "";
    return record;
  }, {});
}
