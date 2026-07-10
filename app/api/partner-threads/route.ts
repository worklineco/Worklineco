import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type ThreadMessage = {
  author: string;
  body: string;
  createdAt: string;
  id: string;
};

const organisationCode = "DCO1433";

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const threads = await admin
    .from("partner_threads")
    .select("*")
    .eq("organisation_code", organisationCode)
    .contains("member_ids", [auth.user.id])
    .order("updated_at", { ascending: false });

  if (threads.error) {
    return NextResponse.json({ error: threads.error.message }, { status: 500 });
  }

  return NextResponse.json({ threads: threads.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json()) as {
    action?: "create" | "message";
    memberIds?: string[];
    members?: string;
    message?: string;
    threadId?: string;
    title?: string;
  };
  const admin = createAdminClient();

  if (body.action === "create") {
    const title = text(body.title);
    const memberIds = Array.from(new Set([auth.user.id, ...(body.memberIds ?? []).map(text).filter(Boolean)]));
    const members = text(body.members);

    if (!title || memberIds.length < 2) {
      return NextResponse.json({ error: "Thread title and at least one member are required." }, { status: 400 });
    }

    const saved = await admin
      .from("partner_threads")
      .insert({
        created_by: auth.user.id,
        member_ids: memberIds,
        members,
        organisation_code: organisationCode,
        title,
        updated_by: auth.user.id
      })
      .select("*")
      .single();

    if (saved.error) {
      return NextResponse.json({ error: saved.error.message }, { status: 500 });
    }

    return NextResponse.json({ thread: saved.data });
  }

  if (body.action === "message") {
    const threadId = text(body.threadId);
    const messageBody = text(body.message);

    if (!threadId || !messageBody) {
      return NextResponse.json({ error: "Thread and message are required." }, { status: 400 });
    }

    const existing = await admin
      .from("partner_threads")
      .select("*")
      .eq("id", threadId)
      .eq("organisation_code", organisationCode)
      .single();

    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 });
    }

    const memberIds = (existing.data.member_ids ?? []) as string[];

    if (!memberIds.includes(auth.user.id)) {
      return NextResponse.json({ error: "Not allowed to write in this thread." }, { status: 403 });
    }

    const metadata = auth.user.user_metadata ?? {};
    const author = text(metadata.full_name) || text(metadata.name) || auth.user.email || "WorkLine User";
    const nextMessage: ThreadMessage = {
      author,
      body: messageBody,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID()
    };
    const messages = [...((existing.data.messages ?? []) as ThreadMessage[]), nextMessage];
    const updated = await admin
      .from("partner_threads")
      .update({
        messages,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id
      })
      .eq("id", threadId)
      .eq("organisation_code", organisationCode)
      .select("*")
      .single();

    if (updated.error) {
      return NextResponse.json({ error: updated.error.message }, { status: 500 });
    }

    return NextResponse.json({ thread: updated.data });
  }

  return NextResponse.json({ error: "Unknown thread action." }, { status: 400 });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Partner thread service is not configured.");
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
