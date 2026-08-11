import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createTransport } from "nodemailer";

type CookieToSet = { name: string; options: CookieOptions; value: string };

const defaultOrganisationCode = "DCO1433";
const organisationIdCache = new Map<string, string>();

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

  if (view === "threads") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const memberships = await admin
      .from("task_chat_participants")
      .select("task_code")
      .eq("organisation_id", organisation.organisationId)
      .eq("user_id", auth.user.id);
    if (memberships.error) {
      return errorResponse(memberships.error);
    }
    const participantCodes = Array.from(
      new Set((memberships.data ?? []).map((row) => text(row.task_code)).filter(Boolean))
    );
    if (!participantCodes.length) {
      return NextResponse.json({ threads: [] });
    }

    const { data, error } = await admin
      .from("task_messages")
      .select("id,task_code,team,entity,task,author_id,author_name,recipient_id,is_private,body,created_at")
      .eq("organisation_id", organisation.organisationId)
      .in("task_code", participantCodes)
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    if (error) {
      return errorResponse(error);
    }
    const byCode = new Map<string, { count: number; entity: string; last_at: string; last_body: string; messages: { author_name: string; body: string; created_at: string; id: string }[]; task: string; task_code: string; team: string }>();
    for (const message of data ?? []) {
      const key = String(message.task_code ?? "");
      if (!key) {
        continue;
      }
      const current = byCode.get(key) ?? { count: 0, entity: "", last_at: "", last_body: "", messages: [], task: "", task_code: key, team: "" };
      current.count += 1;
      current.last_body = String(message.body ?? "");
      current.last_at = String(message.created_at ?? "");
      current.messages.push({
        author_name: String(message.author_name ?? ""),
        body: String(message.body ?? ""),
        created_at: String(message.created_at ?? ""),
        id: String(message.id ?? "")
      });
      if (message.entity) current.entity = String(message.entity);
      if (message.task) current.task = String(message.task);
      if (message.team) current.team = String(message.team);
      byCode.set(key, current);
    }
    const threads = Array.from(byCode.values()).sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
    return NextResponse.json({ threads });
  }

  const code = text(url.searchParams.get("code"));
  if (!code) {
    return NextResponse.json({ messages: [] });
  }
  const membership = await admin
    .from("task_chat_participants")
    .select("task_code")
    .eq("organisation_id", organisation.organisationId)
    .eq("task_code", code)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (membership.error) {
    return errorResponse(membership.error);
  }
  if (!membership.data) {
    return NextResponse.json({ messages: [] });
  }

  const { data, error } = await admin
    .from("task_messages")
    .select("id,task_code,team,author_id,author_name,recipient_id,is_private,body,created_at")
    .eq("organisation_id", organisation.organisationId)
    .eq("task_code", code)
    .order("created_at", { ascending: true });
  if (error) {
    return errorResponse(error);
  }
  return NextResponse.json({ messages: data ?? [] });
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
  const profile = await admin
    .from("users")
    .select("full_name,email")
    .eq("id", auth.user.id)
    .eq("organisation_id", organisation.organisationId)
    .maybeSingle();
  const authorName = text(profile.data?.full_name ?? profile.data?.email ?? auth.user.email) || "WorkLine user";

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
    if (original.error || !original.data) {
      return NextResponse.json({ error: "The message being replied to was not found." }, { status: 404 });
    }
    const originalCode = text(original.data.task_code);
    const replyMembership = await admin
      .from("task_chat_participants")
      .select("user_id")
      .eq("organisation_id", organisation.organisationId)
      .eq("task_code", originalCode)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (replyMembership.error) {
      return errorResponse(replyMembership.error);
    }
    if (!replyMembership.data) {
      return NextResponse.json({ error: "You are not a participant in this Task Chat." }, { status: 403 });
    }

    code = code || originalCode;
    entity = entity || text(original.data.entity);
    task = task || text(original.data.task);
    team = team || text(original.data.team);
    recipientId = original.data.author_id ?? null;
    if (recipientId) {
      const recipientProfile = await admin
        .from("users")
        .select("email")
        .eq("id", recipientId)
        .eq("organisation_id", organisation.organisationId)
        .maybeSingle();
      recipientEmail = text(recipientProfile.data?.email).toLowerCase();
    }
  } else {
    const mentionEmail = extractMentionEmail(body);
    if (mentionEmail) {
      const recipient = await findOrganisationUserByEmail(admin, organisation.organisationId, mentionEmail);
      if (!recipient) {
        return NextResponse.json({ error: "The tagged teammate was not found in your organisation." }, { status: 400 });
      }
      recipientEmail = recipient.email;
      recipientId = recipient.id;
    }
  }

  if (!code || !body) {
    return NextResponse.json({ error: "Task code and message are required." }, { status: 400 });
  }

  const participantResult = await admin
    .from("task_chat_participants")
    .select("user_id")
    .eq("organisation_id", organisation.organisationId)
    .eq("task_code", code);
  if (participantResult.error) {
    return errorResponse(participantResult.error);
  }
  const participantIds = new Set((participantResult.data ?? []).map((row) => text(row.user_id)).filter(Boolean));
  if (participantIds.size && !participantIds.has(auth.user.id)) {
    return NextResponse.json({ error: "This Task Chat is only available to its participants." }, { status: 403 });
  }
  if (!participantIds.size && (!recipientId || recipientId === auth.user.id)) {
    return NextResponse.json(
      { error: "Tag a teammate by email to start this private Task Chat." },
      { status: 400 }
    );
  }

  const newParticipants = [auth.user.id, recipientId].filter(
    (userId): userId is string => Boolean(userId)
  );
  const participantRows = Array.from(new Set(newParticipants)).map((userId) => ({
    added_by: auth.user.id,
    organisation_id: organisation.organisationId,
    task_code: code,
    user_id: userId
  }));
  if (participantRows.length) {
    const participants = await admin
      .from("task_chat_participants")
      .upsert(participantRows, { onConflict: "organisation_id,task_code,user_id" });
    if (participants.error) {
      return errorResponse(participants.error);
    }
  }

  const inserted = await admin.from("task_messages").insert({
    author_id: auth.user.id,
    author_name: authorName,
    body,
    entity: entity || null,
    is_private: true,
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

  if (recipientEmail && recipientId !== auth.user.id) {
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

async function findOrganisationUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  email: string
) {
  const target = email.trim().toLowerCase();
  const { data, error } = await admin
    .from("users")
    .select("id,email")
    .eq("organisation_id", organisationId)
    .ilike("email", target)
    .maybeSingle();
  if (error || !data?.id || !data.email) {
    return null;
  }
  return { email: text(data.email).toLowerCase(), id: String(data.id) };
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
  const cached = organisationIdCache.get(user.id);
  if (cached) {
    return { organisationId: cached };
  }
  const { data, error } = await admin.from("users").select("organisation_id").eq("id", user.id).single();
  if (!error && data?.organisation_id) {
    organisationIdCache.set(user.id, data.organisation_id as string);
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
  organisationIdCache.set(user.id, organisationId as string);
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
