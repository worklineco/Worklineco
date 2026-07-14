import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };
type MeetingBooking = {
  booking_date?: string;
  floor?: string;
  from_time?: string;
  id?: string;
  purpose?: string;
  room_name?: string;
  team_name?: string;
  to_time?: string;
};
type AccessScope = {
  organisationCode: string;
};

const defaultOrganisationCode = "DCO1433";
const tableName = "meeting_room_bookings";
const logTableName = "meeting_room_booking_logs";
const maxDurationMinutes = 120;
const rooms = new Map([
  ["Manthan", "3rd Floor"],
  ["Darshan", "2nd Floor"],
  ["Jnan", "2nd Floor"],
  ["Charitra", "2nd Floor"],
  ["Setu", "1st Floor"],
  ["Samvad", "1st Floor"]
]);

export async function GET() {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const admin = createAdminClient();
  const access = getAccessScope(auth.user);
  const { data, error } = await admin
    .from(tableName)
    .select("*")
    .eq("organisation_code", access.organisationCode)
    .order("booking_date", { ascending: true })
    .order("from_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: formatSetupError(error.message) }, { status: 500 });
  }

  const logs = await loadLogs(admin, access);

  return NextResponse.json({ bookings: data ?? [], logs });
}

export async function POST(request: Request) {
  const auth = await requireUser();

  if ("error" in auth) {
    return auth.error;
  }

  const payload = (await request.json()) as {
    action?: string;
    booking?: MeetingBooking;
    id?: string;
  };
  const admin = createAdminClient();
  const access = getAccessScope(auth.user);

  if (payload.action === "delete") {
    if (!payload.id) {
      return NextResponse.json({ error: "Booking id is required." }, { status: 400 });
    }

    const existing = await admin
      .from(tableName)
      .select("*")
      .eq("id", payload.id)
      .eq("organisation_code", access.organisationCode)
      .maybeSingle();

    if (existing.error) {
      return NextResponse.json({ error: formatSetupError(existing.error.message) }, { status: 500 });
    }

    const deleted = await admin
      .from(tableName)
      .delete()
      .eq("id", payload.id)
      .eq("organisation_code", access.organisationCode);

    if (deleted.error) {
      return NextResponse.json({ error: formatSetupError(deleted.error.message) }, { status: 500 });
    }

    await writeLog(admin, auth.user, access, "delete", payload.id, existing.data ?? null, null);
    return loadResponse(admin, access);
  }

  const booking = cleanBooking(payload.booking ?? {}, auth.user, access);
  const validationError = validateBooking(booking);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const overlap = await findOverlap(admin, access, booking);

  if (overlap.error) {
    return NextResponse.json({ error: formatSetupError(overlap.error.message) }, { status: 500 });
  }

  if ((overlap.data ?? []).length) {
    return NextResponse.json({ error: `${booking.room_name} already has a booking during this time.` }, { status: 409 });
  }

  const id = text(payload.booking?.id);
  const existing = id
    ? await admin
        .from(tableName)
        .select("*")
        .eq("id", id)
        .eq("organisation_code", access.organisationCode)
        .maybeSingle()
    : null;

  if (existing?.error) {
    return NextResponse.json({ error: formatSetupError(existing.error.message) }, { status: 500 });
  }

  const { id: _bookingId, ...bookingData } = booking;
  const saved = id
    ? await admin
        .from(tableName)
        .update({
          ...bookingData,
          updated_at: new Date().toISOString(),
          updated_by: auth.user.id
        })
        .eq("id", id)
        .eq("organisation_code", access.organisationCode)
        .select("*")
        .single()
    : await admin
        .from(tableName)
        .insert({
          ...bookingData,
          created_by: auth.user.id,
          updated_by: auth.user.id
        })
        .select("*")
        .single();

  if (saved.error) {
    return NextResponse.json({ error: formatSetupError(saved.error.message) }, { status: 500 });
  }

  await writeLog(admin, auth.user, access, id ? "update" : "create", saved.data.id, existing?.data ?? null, saved.data);
  return loadResponse(admin, access);
}

async function loadResponse(admin: ReturnType<typeof createAdminClient>, access: AccessScope) {
  const { data, error } = await admin
    .from(tableName)
    .select("*")
    .eq("organisation_code", access.organisationCode)
    .order("booking_date", { ascending: true })
    .order("from_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: formatSetupError(error.message) }, { status: 500 });
  }

  const logs = await loadLogs(admin, access);

  return NextResponse.json({ bookings: data ?? [], logs });
}

async function loadLogs(admin: ReturnType<typeof createAdminClient>, access: AccessScope) {
  const { data, error } = await admin
    .from(logTableName)
    .select("*")
    .eq("organisation_code", access.organisationCode)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return [];
  }

  return data ?? [];
}

async function writeLog(
  admin: ReturnType<typeof createAdminClient>,
  user: User,
  access: AccessScope,
  action: string,
  bookingId: string | null | undefined,
  oldValue: unknown,
  newValue: unknown
) {
  await admin.from(logTableName).insert({
    action,
    actor_name: text(user.user_metadata?.full_name) || text(user.user_metadata?.name) || user.email || "WorkLine user",
    actor_user_id: user.id,
    booking_id: bookingId || null,
    new_value: newValue,
    old_value: oldValue,
    organisation_code: access.organisationCode
  });
}

function cleanBooking(booking: MeetingBooking, user: User, access: AccessScope) {
  const roomName = text(booking.room_name);

  return {
    booking_date: text(booking.booking_date),
    floor: rooms.get(roomName) ?? text(booking.floor),
    from_time: normalizeTime(booking.from_time),
    id: text(booking.id),
    organisation_code: access.organisationCode,
    purpose: text(booking.purpose),
    room_name: roomName,
    team_name: text(booking.team_name) || text(user.user_metadata?.team) || "WorkLine Team",
    to_time: normalizeTime(booking.to_time)
  };
}

function validateBooking(booking: ReturnType<typeof cleanBooking>) {
  if (!booking.booking_date || !booking.room_name || !booking.floor || !booking.from_time || !booking.to_time || !booking.team_name || !booking.purpose) {
    return "Date, room, time, team, and purpose are required.";
  }

  if (!rooms.has(booking.room_name)) {
    return "Select a valid meeting room.";
  }

  const duration = minutesFromTime(booking.to_time) - minutesFromTime(booking.from_time);

  if (duration <= 0) {
    return "Choose a To time after the From time.";
  }

  if (duration > maxDurationMinutes) {
    return "Maximum booking slot is 2 hours.";
  }

  return "";
}

function findOverlap(
  admin: ReturnType<typeof createAdminClient>,
  access: AccessScope,
  booking: ReturnType<typeof cleanBooking> & { id?: string }
) {
  let query = admin
    .from(tableName)
    .select("id")
    .eq("organisation_code", access.organisationCode)
    .eq("booking_date", booking.booking_date)
    .eq("room_name", booking.room_name)
    .lt("from_time", booking.to_time)
    .gt("to_time", booking.from_time);

  if (booking.id) {
    query = query.neq("id", booking.id);
  }

  return query;
}

function normalizeTime(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return "";
  }

  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function getAccessScope(user: User): AccessScope {
  return {
    organisationCode: text(user.user_metadata?.organisation_id) || defaultOrganisationCode
  };
}

function formatSetupError(message: string) {
  return message.includes(tableName) || message.includes(logTableName)
    ? "Meeting room setup is pending. Run database/010_meeting_room_bookings.sql in Supabase SQL editor once."
    : message;
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Meeting room service is not configured.");
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

function text(value: unknown) {
  return String(value ?? "").trim();
}
