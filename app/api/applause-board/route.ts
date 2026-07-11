import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type Audience = "everyone" | "group" | "person";

const organisationCode = "DCO1433";

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const posts = await admin
    .from("applause_posts")
    .select("*")
    .eq("organisation_code", organisationCode)
    .order("created_at", { ascending: false })
    .limit(100);

  if (posts.error) {
    return NextResponse.json({ error: posts.error.message }, { status: 500 });
  }

  const visiblePosts = (posts.data ?? []).filter((post) => {
    const recipientIds = (post.recipient_ids ?? []) as string[];
    const taggedIds = (post.tagged_ids ?? []) as string[];

    return (
      post.audience === "everyone" ||
      post.created_by === auth.user.id ||
      recipientIds.includes(auth.user.id) ||
      taggedIds.includes(auth.user.id)
    );
  });

  return NextResponse.json({ posts: visiblePosts });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json()) as {
    audience?: Audience;
    message?: string;
    recipientIds?: string[];
    recipientNames?: string;
    taggedIds?: string[];
    taggedNames?: string;
  };
  const audience = body.audience ?? "everyone";
  const message = text(body.message);
  const recipientIds = Array.from(new Set((body.recipientIds ?? []).map(text).filter(Boolean)));
  const taggedIds = Array.from(new Set((body.taggedIds ?? []).map(text).filter(Boolean)));

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if ((audience === "group" || audience === "person") && recipientIds.length === 0) {
    return NextResponse.json({ error: "Select at least one recipient." }, { status: 400 });
  }

  const metadata = auth.user.user_metadata ?? {};
  const authorName = text(metadata.full_name) || text(metadata.name) || auth.user.email || "WorkLine User";
  const admin = createAdminClient();
  const saved = await admin
    .from("applause_posts")
    .insert({
      audience,
      author_name: authorName,
      created_by: auth.user.id,
      message,
      organisation_code: organisationCode,
      recipient_ids: audience === "everyone" ? [] : recipientIds,
      recipient_names: audience === "everyone" ? "Everyone" : text(body.recipientNames),
      tagged_ids: taggedIds,
      tagged_names: text(body.taggedNames)
    })
    .select("*")
    .single();

  if (saved.error) {
    return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }

  return NextResponse.json({ post: saved.data });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Applause board service is not configured.");
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
