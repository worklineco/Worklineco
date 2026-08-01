import { createClient, type User } from "@supabase/supabase-js";
import { createTransport } from "nodemailer";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type TaskLineRow = Record<string, string>;
type TaskRecord = {
  custom_values: {
    taskline_data?: TaskLineRow;
    workline_module?: string;
  } | null;
  due_at: string | null;
  id: string;
  organisation_id: string;
};
type OrganisationMember = {
  email: string | null;
  full_name: string | null;
  id: string;
  organisation_id: string;
  status: string | null;
};
type ReminderAuditValue = {
  due_date?: string;
  recipient?: string;
};

const moduleKey = "taskline";
const fetchBatchSize = 1000;
const appUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.worklineco.com").replace(/\/+$/, "");

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const smtp = smtpConfiguration();

  if ("error" in smtp) {
    return NextResponse.json({ error: smtp.error }, { status: 500 });
  }

  const admin = createAdminClient();
  const dueDateKey = indiaDateKey(1);
  const followingDateKey = indiaDateKey(2);
  const dueTasks = await loadDueTasks(admin, dueDateKey, followingDateKey);

  if ("error" in dueTasks) {
    return NextResponse.json({ error: dueTasks.error }, { status: 500 });
  }

  if (!dueTasks.tasks.length) {
    return NextResponse.json({ dueDate: dueDateKey, failed: 0, sent: 0, skipped: 0 });
  }

  const organisationIds = Array.from(new Set(dueTasks.tasks.map((task) => task.organisation_id)));
  const [membersResult, authUsers, sentKeys] = await Promise.all([
    loadOrganisationMembers(admin, organisationIds),
    loadAuthUsers(admin),
    loadSentReminderKeys(admin, dueTasks.tasks, dueDateKey)
  ]);

  if ("error" in membersResult) {
    return NextResponse.json({ error: membersResult.error }, { status: 500 });
  }

  const authUsersById = new Map(authUsers.map((user) => [user.id, user]));
  const membersByOrganisation = new Map<string, OrganisationMember[]>();

  for (const member of membersResult.members) {
    const current = membersByOrganisation.get(member.organisation_id) ?? [];
    current.push(member);
    membersByOrganisation.set(member.organisation_id, current);
  }

  const transporter = createTransport({
    auth: {
      pass: smtp.password,
      user: smtp.user
    },
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465
  });

  let failed = 0;
  let sent = 0;
  let skipped = 0;

  for (const task of dueTasks.tasks) {
    const row = task.custom_values?.taskline_data ?? {};

    if (taskIsClosed(row)) {
      skipped += 1;
      continue;
    }

    const recipients = reminderRecipients(
      row,
      membersByOrganisation.get(task.organisation_id) ?? [],
      authUsersById
    );

    if (!recipients.length) {
      skipped += 1;
      continue;
    }

    for (const recipient of recipients) {
      const key = reminderKey(task.id, recipient, dueDateKey);

      if (sentKeys.has(key)) {
        skipped += 1;
        continue;
      }

      try {
        await transporter.sendMail({
          from: smtp.from,
          html: reminderHtml(row, dueDateKey),
          subject: reminderSubject(row),
          text: reminderText(row, dueDateKey),
          to: recipient
        });

        const logged = await admin.from("audit_logs").insert({
          action: "taskline.due_email_sent",
          actor_user_id: null,
          entity_id: task.id,
          entity_type: "taskline_email_reminder",
          new_value: {
            due_date: dueDateKey,
            recipient,
            sent_at: new Date().toISOString()
          },
          old_value: null,
          organisation_id: task.organisation_id
        });

        if (logged.error) {
          console.error("Could not record TaskLine due reminder:", logged.error.message);
        }

        sentKeys.add(key);
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error("Could not send TaskLine due reminder:", error);
      }
    }
  }

  return NextResponse.json({
    dueDate: dueDateKey,
    failed,
    sent,
    skipped
  });
}

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (cronSecret) {
    return authorization === `Bearer ${cronSecret}`;
  }

  return request.headers.get("user-agent")?.toLowerCase().startsWith("vercel-cron/") ?? false;
}

function smtpConfiguration() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const from = process.env.TASK_REMINDER_FROM_EMAIL ?? process.env.OTP_FROM_EMAIL ?? "";
  const user = process.env.SMTP_USER ?? extractEmailAddress(from);
  const password = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, "");

  if (!host || !user || !password || !Number.isFinite(port)) {
    return { error: "Task reminder email is not configured." as const };
  }

  return {
    from: from || `WorkLine Co <${user}>`,
    host,
    password,
    port,
    user
  };
}

async function loadDueTasks(
  admin: ReturnType<typeof createAdminClient>,
  dueDateKey: string,
  followingDateKey: string
) {
  const tasks: TaskRecord[] = [];

  for (let from = 0; ; from += fetchBatchSize) {
    const result = await admin
      .from("tasks")
      .select("id,organisation_id,due_at,custom_values")
      .eq("custom_values->>workline_module", moduleKey)
      .gte("due_at", `${dueDateKey}T00:00:00.000Z`)
      .lt("due_at", `${followingDateKey}T00:00:00.000Z`)
      .order("id", { ascending: true })
      .range(from, from + fetchBatchSize - 1);

    if (result.error) {
      return { error: result.error.message, tasks: [] as TaskRecord[] };
    }

    tasks.push(...((result.data ?? []) as TaskRecord[]));

    if ((result.data ?? []).length < fetchBatchSize) {
      return { tasks };
    }
  }
}

async function loadOrganisationMembers(
  admin: ReturnType<typeof createAdminClient>,
  organisationIds: string[]
) {
  const members: OrganisationMember[] = [];

  for (let from = 0; ; from += fetchBatchSize) {
    const result = await admin
      .from("users")
      .select("id,email,full_name,organisation_id,status")
      .in("organisation_id", organisationIds)
      .order("id", { ascending: true })
      .range(from, from + fetchBatchSize - 1);

    if (result.error) {
      return { error: result.error.message, members: [] as OrganisationMember[] };
    }

    members.push(
      ...((result.data ?? []) as OrganisationMember[]).filter(
        (member) => text(member.status).toLowerCase() !== "inactive"
      )
    );

    if ((result.data ?? []).length < fetchBatchSize) {
      return { members };
    }
  }
}

async function loadAuthUsers(admin: ReturnType<typeof createAdminClient>) {
  const users: User[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });

    if (result.error) {
      console.error("Could not load TaskLine reminder users:", result.error.message);
      break;
    }

    users.push(...result.data.users);

    if (result.data.users.length < 1000) {
      break;
    }
  }

  return users;
}

async function loadSentReminderKeys(
  admin: ReturnType<typeof createAdminClient>,
  tasks: TaskRecord[],
  dueDateKey: string
) {
  const taskIds = tasks.map((task) => task.id);
  const result = await admin
    .from("audit_logs")
    .select("entity_id,new_value")
    .eq("action", "taskline.due_email_sent")
    .eq("entity_type", "taskline_email_reminder")
    .in("entity_id", taskIds)
    .gte("created_at", new Date(Date.now() - 3 * 86400000).toISOString())
    .limit(5000);

  if (result.error) {
    console.error("Could not load TaskLine reminder history:", result.error.message);
    return new Set<string>();
  }

  return new Set(
    (result.data ?? []).map((log) => {
      const value = (log.new_value ?? {}) as ReminderAuditValue;
      return reminderKey(text(log.entity_id), text(value.recipient), text(value.due_date) || dueDateKey);
    })
  );
}

function reminderRecipients(
  row: TaskLineRow,
  members: OrganisationMember[],
  authUsersById: Map<string, User>
) {
  const recipients = new Set(parseEmailAddresses(row.reminder_email));

  for (const member of members) {
    const user = authUsersById.get(member.id);

    if (!user || !taskIsAssignedTo(row, user, member.full_name)) {
      continue;
    }

    const email = text(user.email || member.email).toLowerCase();

    if (isEmail(email)) {
      recipients.add(email);
    }
  }

  return Array.from(recipients).sort();
}

function taskIsAssignedTo(row: TaskLineRow, user: User, fallbackName: string | null) {
  const roleText = `${text(user.user_metadata?.role)} ${text(user.user_metadata?.designation)}`.toLowerCase();
  const field = roleText.includes("article") ? "resource" : "name";
  const name = normalizeName(
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? fallbackName ?? user.email
  );

  return Boolean(name) && splitNames(row[field]).includes(name);
}

function taskIsClosed(row: TaskLineRow) {
  const status = text(row.status_open_close).toLowerCase();
  return status === "close" || status === "closed";
}

function reminderSubject(row: TaskLineRow) {
  const entity = text(row.entity) || "TaskLine task";
  const task = text(row.task) || "Task";
  return `Due tomorrow: ${entity} — ${task}`;
}

function reminderText(row: TaskLineRow, dueDateKey: string) {
  return [
    "TASK DUE TOMORROW",
    "",
    text(row.entity) || "Entity not specified",
    `Task: ${text(row.task) || "Not specified"}`,
    `Due date: ${formatDueDate(text(row.due_date), dueDateKey)}`,
    "",
    `Open TaskLine: ${appUrl}/taskline`
  ].join("\n");
}

function reminderHtml(row: TaskLineRow, dueDateKey: string) {
  const entity = escapeHtml(text(row.entity) || "Entity not specified");
  const task = escapeHtml(text(row.task) || "Not specified");
  const dueDate = escapeHtml(formatDueDate(text(row.due_date), dueDateKey));
  const taskLineUrl = `${appUrl}/taskline`;

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;">${entity} is due tomorrow.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fa;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="52" valign="top">
                      <div style="width:44px;height:44px;border-radius:14px;background:#fef3c7;color:#b45309;text-align:center;line-height:44px;font-size:21px;">&#128197;</div>
                    </td>
                    <td style="padding-left:14px;">
                      <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.2px;color:#b45309;">TASK DUE TOMORROW</div>
                      <div style="margin-top:6px;font-size:17px;line-height:24px;font-weight:700;color:#172033;">${entity}</div>
                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:12px;font-size:14px;line-height:22px;">
                        <tr>
                          <td style="width:78px;color:#94a3b8;font-weight:600;">Task</td>
                          <td style="color:#475569;font-weight:600;">${task}</td>
                        </tr>
                        <tr>
                          <td style="color:#94a3b8;font-weight:600;">Due date</td>
                          <td style="color:#475569;font-weight:600;">${dueDate}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:22px;text-align:center;">
                  <a href="${escapeHtml(taskLineUrl)}" style="display:inline-block;border-radius:10px;background:#1e3168;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;">Open TaskLine</a>
                </div>
              </td>
            </tr>
          </table>
          <div style="padding-top:12px;font-size:11px;line-height:18px;color:#94a3b8;">Automated reminder from WorkLine Co</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function formatDueDate(value: string, dueDateKey: string) {
  const normalized = normalizeDisplayDate(value) || displayDateFromKey(dueDateKey);
  const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (!match) {
    return normalized || "Not set";
  }

  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  });
}

function normalizeDisplayDate(value: unknown) {
  const raw = text(value);
  const dayMonthYear = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);

  if (dayMonthYear) {
    const year = dayMonthYear[3].length === 2 ? `20${dayMonthYear[3]}` : dayMonthYear[3];
    return `${pad2(Number(dayMonthYear[1]))}-${pad2(Number(dayMonthYear[2]))}-${year}`;
  }

  const yearMonthDay = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  return yearMonthDay
    ? `${pad2(Number(yearMonthDay[3]))}-${pad2(Number(yearMonthDay[2]))}-${yearMonthDay[1]}`
    : "";
}

function displayDateFromKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function indiaDateKey(dayOffset: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric"
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + dayOffset));

  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function reminderKey(taskId: string, recipient: string, dueDateKey: string) {
  return `${taskId}|${recipient.toLowerCase()}|${dueDateKey}`;
}

function parseEmailAddresses(value: unknown) {
  return text(value)
    .split(/[\s,;]+/)
    .map((email) => email.toLowerCase())
    .filter(isEmail);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function splitNames(value: unknown) {
  return text(value)
    .split(/[,;/\n]+/)
    .map(normalizeName)
    .filter(Boolean);
}

function normalizeName(value: unknown) {
  const honorifics = new Set(["ca", "cs", "cma", "adv", "advocate", "mr", "mrs", "ms", "dr", "shri", "smt", "sh"]);
  const parts = text(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  while (parts.length > 1 && honorifics.has(parts[0])) {
    parts.shift();
  }

  return parts.join(" ");
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return match?.[1]?.trim() || (value.includes("@") ? value.trim() : undefined);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character] ?? character);
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("TaskLine reminder service is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function text(value: unknown) {
  return String(value ?? "").trim();
}
