import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createTransport } from "nodemailer";

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
  const url = new URL(request.url);
  const view = text(url.searchParams.get("view"));

  if (view === "mine") {
    const { data, error } = await admin
      .from("task_messages")
      .select("id,task_code,team,author_name,body,created_at,entity,task,read_at")
      .eq("organisation_id", organisation.organisationId)
      .eq("recipient_id", auth.user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      return errorResponse(error);
    }
    return NextResponse.json({ messages: data ?? [] });
  }

  const code = text(url.searchParams.get("code"));
  if (!code) {
    return NextResponse.json({ messages: [] });
  }
  const access = getAccess(auth.user);
  let query = admin
    .from("task_messages")
    .select("id,task_code,team,author_id,author_name,recipient_id,is_private,body,created_at")
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
  const visible = (data ?? []).filter(
    (message) => !message.is_private || message.author_id === auth.user.id || message.recipient_id === auth.user.id
  );
  return NextResponse.json({ messages: visible });
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
  const payload = (await request.json()) as {
    action?: string;
    body?: string;
    code?: string;
    entity?: string;
    id?: string;
    reply_to_id?: string;
    task?: string;
    team?: string;
  };

  if (text(payload.action) === "mark_read") {
    const messageId = text(payload.id);
    if (!messageId) {
      return NextResponse.json({ error: "Message id is required." }, { status: 400 });
    }
    const updated = await admin
      .from("task_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("organisation_id", organisation.organisationId)
      .eq("recipient_id", auth.user.id);
    if (updated.error) {
      return errorResponse(updated.error);
    }
    return NextResponse.json({ ok: true });
  }

  const body = text(payload.body);
  const metadata = auth.user.user_metadata ?? {};
  const authorName = text(metadata.full_name ?? metadata.name ?? auth.user.email) || "WorkLine user";

  let code = text(payload.code);
  let entity = text(payload.entity);
  let task = text(payload.task);
  let team = text(payload.team);
  let recipientEmail = "";
  let recipientId: string | null = null;

  const replyToId = text(payload.reply_to_id);
  if (replyToId) {
    const original = await admin
      .from("task_messages")
      .select("task_code,team,entity,task,author_id")
      .eq("id", replyToId)
      .eq("organisation_id", organisation.organisationId)
      .single();
    if (original.data) {
      code = code || text(original.data.task_code);
      entity = entity || text(original.data.entity);
      task = task || text(original.data.task);
      team = team || text(original.data.team);
      recipientId = (original.data.author_id as string | null) ?? null;
      if (recipientId) {
        const authorUser = await admin.auth.admin.getUserById(recipientId);
        recipientEmail = authorUser.data?.user?.email ?? "";
      }
    }
  } else {
    const mentionEmail = extractMentionEmail(body);
    if (mentionEmail) {
      recipientEmail = mentionEmail;
      const recipient = await findUserByEmail(admin, mentionEmail);
      recipientId = recipient?.id ?? null;
    }
  }

  if (!code || !body) {
    return NextResponse.json({ error: "Task code and message are required." }, { status: 400 });
  }

  const isPrivate = Boolean(recipientEmail || recipientId);

  const inserted = await admin.from("task_messages").insert({
    author_id: auth.user.id,
    author_name: authorName,
    body,
    entity: entity || null,
    is_private: isPrivate,
    organisation_id: organisation.organisationId,
    recipient_email: recipientEmail || null,
    recipient_id: recipientId,
    task: task || null,
    task_code: code,
    team
  });
  if (inserted.error) {
    return errorResponse(inserted.error);
  }

  if (recipientEmail) {
    void sendMentionEmail(recipientEmail, authorName, code, entity, task, body).catch(() => {
      // email delivery is best-effort; the in-app message is already saved
    });
  }

  return NextResponse.json({ ok: true, mentioned: recipientEmail || null });
}

function extractMentionEmail(body: string): string {
  const match = body.match(/@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return match ? match[1].trim().toLowerCase() : "";
}

async function findUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const target = email.trim().toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      return null;
    }
    const found = data.users.find((user) => (user.email ?? "").trim().toLowerCase() === target);
    if (found) {
      return found;
    }
    if (data.users.length < 1000) {
      break;
    }
    page += 1;
  }
  return null;
}

function smtpConfiguration() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const from = process.env.TASK_REMINDER_FROM_EMAIL ?? process.env.OTP_FROM_EMAIL ?? "";
  const user = process.env.SMTP_USER ?? extractEmailAddress(from);
  const password = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, "");
  if (!host || !user || !password || !Number.isFinite(port)) {
    return { error: "email-not-configured" as const };
  }
  return { from: from || `WorkLine Co <${user}>`, host, password, port, user };
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendMentionEmail(to: string, authorName: string, code: string, entity: string, task: string, body: string) {
  const smtp = smtpConfiguration();
  if ("error" in smtp) {
    return;
  }
  const transporter = createTransport({
    auth: { pass: smtp.password, user: smtp.user },
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465
  });
  const context = [entity, task].filter(Boolean).join(" · ");
  await transporter.sendMail({
    from: smtp.from,
    html: `<p><strong>${escapeHtml(authorName)}</strong> sent you a message on <strong>Task ${escapeHtml(code)}</strong>${context ? ` (${escapeHtml(context)})` : ""}:</p><blockquote style="border-left:3px solid #cbd5e1;padding-left:12px;color:#334155">${escapeHtml(body)}</blockquote><p>Open WorkLine to view and reply.</p>`,
    subject: `${authorName} messaged you on Task ${code}`,
    text: `${authorName} sent you a message on Task ${code}${context ? ` (${context})` : ""}:\n\n${body}\n\nOpen WorkLine to view and reply.`,
    to
  });
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
