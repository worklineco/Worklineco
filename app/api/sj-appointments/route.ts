import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createTransport } from "nodemailer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type Appointment = {
  appointment_date?: string;
  from_time?: string;
  id?: string;
  notes?: string;
  purpose?: string;
  title?: string;
  to_time?: string;
};
type AccessScope = {
  email: string;
  name: string;
  organisationId: string;
  userId: string;
};

const allowedEmails = new Set(["jatinshah.dco@gmail.com", "somya.dco@gmail.com"]);
const somyaEmail = "somya.dco@gmail.com";
const tableName = "sj_appointments";
const logTableName = "sj_appointment_logs";
const maxDurationMinutes = 120;
const mandatoryCallStartMinutes = 23 * 60;
const mandatoryCallMessage = "Mandatory Call — You cannot book a slot during this time.";

export async function GET() {
  const access = await requireAccess();
  if ("error" in access) return access.error;

  const admin = createAdminClient();
  const result = await loadData(admin, access.scope);
  if ("error" in result) return result.error;
  return NextResponse.json(result.data);
}

export async function POST(request: Request) {
  const access = await requireAccess();
  if ("error" in access) return access.error;

  const payload = (await request.json()) as {
    action?: string;
    appointment?: Appointment;
    id?: string;
  };
  const admin = createAdminClient();

  if (payload.action === "delete") {
    const id = text(payload.id);
    if (!id) return NextResponse.json({ error: "Appointment id is required." }, { status: 400 });

    const existing = await admin
      .from(tableName)
      .select("*")
      .eq("id", id)
      .eq("organisation_id", access.scope.organisationId)
      .maybeSingle();
    if (existing.error) return setupError(existing.error.message);
    if (!existing.data) return NextResponse.json({ error: "Appointment was not found." }, { status: 404 });

    const deleted = await admin
      .from(tableName)
      .delete()
      .eq("id", id)
      .eq("organisation_id", access.scope.organisationId);
    if (deleted.error) return setupError(deleted.error.message);

    await writeLog(admin, access.scope, "delete", id, existing.data, null);
    const result = await loadData(admin, access.scope);
    if ("error" in result) return result.error;
    return NextResponse.json(result.data);
  }

  const appointment = cleanAppointment(payload.appointment ?? {}, access.scope.organisationId);
  const validation = validateAppointment(appointment);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });

  const overlap = await findOverlap(admin, access.scope, appointment);
  if (overlap.error) return setupError(overlap.error.message);
  if ((overlap.data ?? []).length) {
    return NextResponse.json({ error: "Another SJ appointment already exists during this time." }, { status: 409 });
  }

  const id = text(payload.appointment?.id);
  const existing = id
    ? await admin
        .from(tableName)
        .select("*")
        .eq("id", id)
        .eq("organisation_id", access.scope.organisationId)
        .maybeSingle()
    : null;
  if (existing?.error) return setupError(existing.error.message);
  if (id && !existing?.data) return NextResponse.json({ error: "Appointment was not found." }, { status: 404 });

  const { id: _appointmentId, ...appointmentData } = appointment;
  const saved = id
    ? await admin
        .from(tableName)
        .update({
          ...appointmentData,
          updated_at: new Date().toISOString(),
          updated_by: access.scope.userId
        })
        .eq("id", id)
        .eq("organisation_id", access.scope.organisationId)
        .select("*")
        .single()
    : await admin
        .from(tableName)
        .insert({
          ...appointmentData,
          created_by: access.scope.userId,
          updated_by: access.scope.userId
        })
        .select("*")
        .single();
  if (saved.error) return setupError(saved.error.message);

  await writeLog(
    admin,
    access.scope,
    id ? "update" : "create",
    saved.data.id,
    existing?.data ?? null,
    saved.data
  );

  let emailWarning = "";
  if (!id) {
    const emailSent = await sendBookingEmail(access.scope, saved.data).catch(() => false);
    if (!emailSent) emailWarning = "Booking saved, but Somya's email notification could not be sent.";
  }

  const result = await loadData(admin, access.scope);
  if ("error" in result) return result.error;
  return NextResponse.json({ ...result.data, emailWarning });
}

async function loadData(admin: ReturnType<typeof createAdminClient>, scope: AccessScope) {
  const { data, error } = await admin
    .from(tableName)
    .select("*")
    .eq("organisation_id", scope.organisationId)
    .order("appointment_date", { ascending: true })
    .order("from_time", { ascending: true });
  if (error) return { error: setupError(error.message) };

  const logs = await admin
    .from(logTableName)
    .select("*")
    .eq("organisation_id", scope.organisationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (logs.error) return { error: setupError(logs.error.message) };

  return { data: { appointments: data ?? [], logs: logs.data ?? [] } };
}

async function writeLog(
  admin: ReturnType<typeof createAdminClient>,
  scope: AccessScope,
  action: string,
  appointmentId: string | null,
  oldValue: unknown,
  newValue: unknown
) {
  const result = await admin.from(logTableName).insert({
    action,
    actor_name: scope.name,
    actor_user_id: scope.userId,
    appointment_id: appointmentId,
    new_value: newValue,
    old_value: oldValue,
    organisation_id: scope.organisationId
  });
  if (result.error) throw new Error(result.error.message);
}

function cleanAppointment(appointment: Appointment, organisationId: string) {
  return {
    appointment_date: text(appointment.appointment_date),
    from_time: normalizeTime(appointment.from_time),
    id: text(appointment.id),
    notes: text(appointment.notes),
    organisation_id: organisationId,
    purpose: text(appointment.purpose),
    title: text(appointment.title),
    to_time: normalizeTime(appointment.to_time)
  };
}

function validateAppointment(appointment: ReturnType<typeof cleanAppointment>) {
  if (!appointment.appointment_date || !appointment.from_time || !appointment.to_time || !appointment.title || !appointment.purpose) {
    return "Date, time, title, and purpose are required.";
  }
  if (overlapsMandatoryCall(appointment.from_time, appointment.to_time)) return mandatoryCallMessage;
  const duration = minutesFromTime(appointment.to_time) - minutesFromTime(appointment.from_time);
  if (duration <= 0) return "Choose a To time after the From time.";
  if (duration > maxDurationMinutes) return "Maximum appointment slot is 2 hours.";
  return "";
}

function findOverlap(
  admin: ReturnType<typeof createAdminClient>,
  scope: AccessScope,
  appointment: ReturnType<typeof cleanAppointment>
) {
  let query = admin
    .from(tableName)
    .select("id")
    .eq("organisation_id", scope.organisationId)
    .eq("appointment_date", appointment.appointment_date)
    .lt("from_time", appointment.to_time)
    .gt("to_time", appointment.from_time);
  if (appointment.id) query = query.neq("id", appointment.id);
  return query;
}

async function requireAccess() {
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
          cookiesToSet.forEach(({ name, options, value }) => cookieStore.set(name, value, options));
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

  const email = text(user.email).toLowerCase();
  if (!allowedEmails.has(email)) {
    return { error: NextResponse.json({ error: "SJ Appointments is available only to Jatin and Somya." }, { status: 403 }) };
  }

  const admin = createAdminClient();
  const profile = await admin
    .from("users")
    .select("organisation_id,email,full_name,status")
    .eq("id", user.id)
    .maybeSingle();
  if (profile.error || !profile.data?.organisation_id || profile.data.status !== "active") {
    return { error: NextResponse.json({ error: "Your active WorkLine profile could not be verified." }, { status: 403 }) };
  }
  if (text(profile.data.email).toLowerCase() !== email) {
    return { error: NextResponse.json({ error: "Your WorkLine profile email could not be verified." }, { status: 403 }) };
  }

  return {
    scope: {
      email,
      name: text(profile.data.full_name) || email,
      organisationId: String(profile.data.organisation_id),
      userId: user.id
    }
  };
}

function smtpConfiguration() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const from = process.env.TASK_REMINDER_FROM_EMAIL ?? process.env.OTP_FROM_EMAIL ?? "";
  const user = process.env.SMTP_USER ?? extractEmailAddress(from);
  const password = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, "");
  if (!host || !user || !password || !Number.isFinite(port)) return null;
  return { from: from || `WorkLine Co <${user}>`, host, password, port, user };
}

async function sendBookingEmail(scope: AccessScope, appointment: Record<string, unknown>) {
  const smtp = smtpConfiguration();
  if (!smtp) return false;

  const transporter = createTransport({
    auth: { pass: smtp.password, user: smtp.user },
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465
  });
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.worklineco.com").replace(/\/$/, "");
  const appointmentUrl = `${baseUrl}/sj-appointments`;
  const date = formatDisplayDate(text(appointment.appointment_date));
  const time = `${formatDisplayTime(text(appointment.from_time))} – ${formatDisplayTime(text(appointment.to_time))}`;
  const title = text(appointment.title);
  const purpose = text(appointment.purpose);
  const notes = text(appointment.notes);

  await transporter.sendMail({
    from: smtp.from,
    to: somyaEmail,
    subject: `SJ Appointment booked: ${title} on ${date}`,
    text: `A new SJ Appointment has been booked by ${scope.name}.\n\nAppointment: ${title}\nDate: ${date}\nTime: ${time}\nPurpose: ${purpose}${notes ? `\nNotes: ${notes}` : ""}\n\nOpen SJ Appointments: ${appointmentUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#0f172a">
      <div style="background:#1e3163;color:#fff;padding:22px;border-radius:14px 14px 0 0">
        <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">WorkLine Co</div>
        <h2 style="margin:8px 0 0;font-size:24px">New SJ Appointment</h2>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:22px;border-radius:0 0 14px 14px">
        <p style="margin:0 0 18px;color:#475569">Booked by <strong>${escapeHtml(scope.name)}</strong></p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#64748b;width:110px">Appointment</td><td style="padding:8px 0;font-weight:700">${escapeHtml(title)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Date</td><td style="padding:8px 0;font-weight:700">${escapeHtml(date)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Time</td><td style="padding:8px 0;font-weight:700">${escapeHtml(time)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Purpose</td><td style="padding:8px 0;font-weight:700">${escapeHtml(purpose)}</td></tr>
          ${notes ? `<tr><td style="padding:8px 0;color:#64748b">Notes</td><td style="padding:8px 0">${escapeHtml(notes)}</td></tr>` : ""}
        </table>
        <a href="${appointmentUrl}" style="display:inline-block;margin-top:20px;background:#1e3163;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">Open SJ Appointments</a>
      </div>
    </div>`
  });
  return true;
}

function normalizeTime(value: unknown) {
  const match = text(value).match(/^(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}` : "";
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function overlapsMandatoryCall(fromTime: string, toTime: string) {
  const fromMinutes = minutesFromTime(fromTime);
  const toMinutes = minutesFromTime(toTime);
  return fromMinutes >= mandatoryCallStartMinutes || toMinutes > mandatoryCallStartMinutes;
}

function formatDisplayDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function formatDisplayTime(value: string) {
  const [hour, minute] = normalizeTime(value).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function setupError(message: string) {
  const setupPending = message.includes(tableName) || message.includes(logTableName);
  return NextResponse.json(
    { error: setupPending ? "SJ Appointments setup is pending." : message },
    { status: setupPending ? 503 : 500 }
  );
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SJ Appointments service is not configured.");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}
