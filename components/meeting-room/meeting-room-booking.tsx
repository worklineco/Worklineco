"use client";

import { ArrowLeft, CalendarDays, Clock3, Edit3, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Booking = {
  booking_date: string;
  floor: string;
  from_time: string;
  id?: string;
  purpose: string;
  room_name: string;
  team_name: string;
  to_time: string;
};
type TeamMember = {
  name: string;
  team: string;
};
type BookingLog = {
  action: string;
  actor_name?: string;
  created_at: string;
  id: string;
  new_value?: Partial<Booking> | null;
  old_value?: Partial<Booking> | null;
};
type ViewMode = "board" | "log";

const rooms = [
  { floor: "3rd Floor", name: "Manthan" },
  { floor: "2nd Floor", name: "Darshan" },
  { floor: "2nd Floor", name: "Jnan" },
  { floor: "2nd Floor", name: "Charitra" },
  { floor: "1st Floor", name: "Setu" },
  { floor: "1st Floor", name: "Samvad" }
];
const fallbackTeams = [
  "Team 01 - Gargi Paliwal",
  "Team 03",
  "Team 04 - Shefali Bang",
  "Team 05 - Dheera Khatri",
  "Team 06 - Sourabh Chippa",
  "Team 07 - Romil Nagori",
  "Team 08 - Shradha Sareen",
  "Team 09 - Naresh Sharma",
  "Team 10 - Pooja Jain",
  "Team 12 - Ayush Dusad",
  "Mr. Arvind Dhadda",
  "Mr. Yash Dhadda",
  "Mrs. Princy Dhadda",
  "Mr. Mudit Jain",
  "Mrs. Shuchi Sethi"
];
const floors = ["All", "3rd Floor", "2nd Floor", "1st Floor"];
const emptyDraft: Booking = {
  booking_date: todayValue(),
  floor: "",
  from_time: "10:00",
  purpose: "",
  room_name: "",
  team_name: "",
  to_time: "11:00"
};

export function MeetingRoomBooking() {
  const [activeFloor, setActiveFloor] = useState("All");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [boardDate, setBoardDate] = useState(todayValue());
  const [draft, setDraft] = useState<Booking>(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<BookingLog[]>([]);
  const [message, setMessage] = useState("");
  const [teams, setTeams] = useState<string[]>(fallbackTeams);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const visibleRooms = rooms.filter((room) => activeFloor === "All" || room.floor === activeFloor);
  const stats = useMemo(() => {
    const dayBookings = bookings.filter((booking) => booking.booking_date === boardDate);
    return {
      available: rooms.length - new Set(dayBookings.map((booking) => booking.room_name)).size,
      booked: dayBookings.length
    };
  }, [boardDate, bookings]);

  useEffect(() => {
    void loadBookings();
    void loadTeams();
  }, []);

  async function loadBookings() {
    setIsLoading(true);

    try {
      const response = await fetch("/api/meeting-room", { cache: "no-store" });
      const result = (await response.json()) as { bookings?: Booking[]; error?: string; logs?: BookingLog[] };

      if (!response.ok) {
        setMessage(result.error ?? "Could not load meeting room bookings.");
        return;
      }

      setBookings(result.bookings ?? []);
      setLogs(result.logs ?? []);
      setMessage("");
    } catch (error) {
      console.error("Meeting room load error:", error);
      setMessage("Could not load meeting room bookings.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTeams() {
    try {
      const response = await fetch("/api/teams", { cache: "no-store" });
      const result = (await response.json()) as { members?: TeamMember[] };
      const teamNames = Array.from(
        new Set((result.members ?? []).map((member) => member.team || member.name).filter(Boolean))
      ).sort((first, second) => first.localeCompare(second));

      if (teamNames.length) {
        setTeams(teamNames);
      }
    } catch {
      setTeams(fallbackTeams);
    }
  }

  function updateDraft(field: keyof Booking, value: string) {
    setDraft((current) => {
      if (field === "room_name") {
        const floor = rooms.find((room) => room.name === value)?.floor ?? "";
        return { ...current, floor, room_name: value };
      }

      if (field === "booking_date") {
        setBoardDate(value);
      }

      return { ...current, [field]: value };
    });
  }

  async function saveBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateDraft(draft, bookings, editingId);

    if (validation) {
      setMessage(validation);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/meeting-room", {
        body: JSON.stringify({ booking: { ...draft, id: editingId || undefined } }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { bookings?: Booking[]; error?: string; logs?: BookingLog[] };

      if (!response.ok) {
        setMessage(result.error ?? "Could not save booking.");
        return;
      }

      setBookings(result.bookings ?? []);
      setLogs(result.logs ?? []);
      resetForm(draft.booking_date);
      setMessage(editingId ? "Booking updated." : "Booking added.");
    } catch (error) {
      console.error("Meeting room save error:", error);
      setMessage("Could not save booking.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteBooking(booking: Booking) {
    if (!window.confirm(`Delete ${booking.room_name} booking for ${booking.team_name}?`)) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/meeting-room", {
        body: JSON.stringify({ action: "delete", id: booking.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { bookings?: Booking[]; error?: string; logs?: BookingLog[] };

      if (!response.ok) {
        setMessage(result.error ?? "Could not delete booking.");
        return;
      }

      setBookings(result.bookings ?? []);
      setLogs(result.logs ?? []);
      if (editingId === booking.id) {
        resetForm(boardDate);
      }
      setMessage("Booking deleted.");
    } catch (error) {
      console.error("Meeting room delete error:", error);
      setMessage("Could not delete booking.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(booking: Booking) {
    setEditingId(booking.id ?? "");
    setBoardDate(booking.booking_date);
    setDraft(booking);
    setMessage("Editing selected booking.");
  }

  function resetForm(date = boardDate) {
    setEditingId("");
    setDraft({ ...emptyDraft, booking_date: date });
  }

  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_14%,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(20,184,166,0.16),transparent_30%),radial-gradient(circle_at_50%_88%,rgba(245,158,11,0.14),transparent_34%)]" />

      <section className="mx-auto max-w-[1500px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1.5 text-xs font-black uppercase text-sky-800">
                <CalendarDays className="size-3.5" />
                Office Scheduler
              </div>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">
                Meeting Room Booking
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Book firm meeting rooms across the 1st, 2nd, and 3rd floors. Slots are limited to 2 hours and conflicting bookings are blocked.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800"
                onClick={() => void loadBookings()}
                type="button"
              >
                <RefreshCw className="size-4" />
                Refresh
              </button>
              <Link
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
                href="/"
              >
                <ArrowLeft className="size-4" />
                Workspace
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <form className="workline-panel grid gap-4 rounded-[24px] p-5 xl:sticky xl:top-5" onSubmit={saveBooking}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
                  {editingId ? "Edit booking" : "New booking"}
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  {editingId ? "Update Room Slot" : "Book a Room"}
                </h2>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Max 2 hr</span>
            </div>

            <FormField label="Booking Date">
              <input
                className="input rounded-md"
                max={dateAfterDays(6)}
                min={todayValue()}
                onChange={(event) => updateDraft("booking_date", event.target.value)}
                type="date"
                value={draft.booking_date}
              />
            </FormField>

            <FormField label="Meeting Room">
              <select className="input rounded-md" onChange={(event) => updateDraft("room_name", event.target.value)} value={draft.room_name}>
                <option value="">Select a room</option>
                {floors.filter((floor) => floor !== "All").map((floor) => (
                  <optgroup key={floor} label={floor}>
                    {rooms.filter((room) => room.floor === floor).map((room) => (
                      <option key={room.name} value={room.name}>{room.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </FormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="From">
                <input className="input rounded-md" onChange={(event) => updateDraft("from_time", event.target.value)} step="300" type="time" value={draft.from_time} />
              </FormField>
              <FormField label="To">
                <input className="input rounded-md" onChange={(event) => updateDraft("to_time", event.target.value)} step="300" type="time" value={draft.to_time} />
              </FormField>
            </div>

            <FormField label="Team">
              <select className="input rounded-md" onChange={(event) => updateDraft("team_name", event.target.value)} value={draft.team_name}>
                <option value="">Select team</option>
                {teams.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Purpose">
              <textarea
                className="input min-h-28 rounded-md py-3"
                onChange={(event) => updateDraft("purpose", event.target.value)}
                placeholder="Weekly planning discussion"
                value={draft.purpose}
              />
            </FormField>

            {message ? (
              <p className={`rounded-md border px-3 py-2 text-sm font-bold ${
                message.toLowerCase().includes("could not") || message.toLowerCase().includes("already") || message.toLowerCase().includes("required")
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}>
                {message}
              </p>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <button className="inline-flex h-12 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-black text-white" disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : editingId ? "Save Changes" : "Add Booking"}
              </button>
              <button className="inline-flex h-12 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-800" onClick={() => resetForm()} type="button">
                Cancel
              </button>
            </div>
          </form>

          <section className="workline-panel rounded-[24px] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
                  {viewMode === "board" ? "Booking Board" : "Booking Log"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {viewMode === "board" ? `${formatDate(boardDate)} Bookings` : "Meeting Room Booking Log"}
                </h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-[130px_130px_180px]">
                <Summary label="Bookings" value={String(stats.booked)} />
                <Summary label="Available" value={String(stats.available)} />
                <FormField label="View Date">
                  <input
                    className="input h-11 rounded-md"
                    max={dateAfterDays(6)}
                    min={todayValue()}
                    onChange={(event) => {
                      setBoardDate(event.target.value);
                      if (!editingId) {
                        setDraft((current) => ({ ...current, booking_date: event.target.value }));
                      }
                    }}
                    type="date"
                    value={boardDate}
                  />
                </FormField>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              <button
                className={`h-10 rounded-md px-3 text-sm font-black ${viewMode === "board" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
                onClick={() => setViewMode("board")}
                type="button"
              >
                Board
              </button>
              <button
                className={`h-10 rounded-md px-3 text-sm font-black ${viewMode === "log" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
                onClick={() => setViewMode("log")}
                type="button"
              >
                Booking Log
              </button>
            </div>

            {viewMode === "board" ? (
              <>
            <div className="mt-4 flex flex-wrap gap-2">
              {floors.map((floor) => (
                <button
                  className={`h-10 rounded-md px-3 text-sm font-black ${activeFloor === floor ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
                  key={floor}
                  onClick={() => setActiveFloor(floor)}
                  type="button"
                >
                  {floor}
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {visibleRooms.map((room) => {
                const roomBookings = bookings
                  .filter((booking) => booking.booking_date === boardDate && booking.room_name === room.name)
                  .sort((first, second) => first.from_time.localeCompare(second.from_time));

                return (
                  <article className="min-h-56 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={room.name}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-black text-slate-950">{room.name}</h3>
                        <p className="mt-1 text-xs font-black uppercase text-slate-500">{room.floor}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${roomBookings.length ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {roomBookings.length ? `${roomBookings.length} booked` : "Available"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2">
                      {isLoading ? (
                        <p className="rounded-md border border-slate-200 px-3 py-4 text-sm font-bold text-slate-500">Loading bookings...</p>
                      ) : roomBookings.length ? (
                        roomBookings.map((booking) => (
                          <div className={`rounded-md border px-3 py-3 ${booking.id === editingId ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`} key={booking.id}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="inline-flex items-center gap-1.5 text-sm font-black text-slate-950">
                                  <Clock3 className="size-4 text-teal-700" />
                                  {formatTime(booking.from_time)} - {formatTime(booking.to_time)}
                                </p>
                                <p className="mt-1 text-sm font-bold text-slate-700">{booking.team_name}</p>
                                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{booking.purpose}</p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <button className="inline-flex size-9 items-center justify-center rounded-md border border-teal-200 bg-white text-teal-700" onClick={() => startEdit(booking)} title="Edit booking" type="button">
                                  <Edit3 className="size-4" />
                                </button>
                                <button className="inline-flex size-9 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700" onClick={() => void deleteBooking(booking)} title="Delete booking" type="button">
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm font-bold text-slate-500">No bookings for this date.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
              </>
            ) : (
              <BookingLogTable logs={logs} />
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

function FormField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1.5 text-xs font-black uppercase text-slate-500">
      {label}
      {children}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function BookingLogTable({ logs }: { logs: BookingLog[] }) {
  return (
    <div className="mt-5 overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-[980px] w-full border-collapse text-left text-sm">
        <thead className="bg-slate-950 text-xs font-black uppercase text-white">
          <tr>
            {["Time", "Action", "Updated By", "Room", "Date", "Time Slot", "Team", "Purpose"].map((heading) => (
              <th className="border-r border-white/10 px-3 py-3 last:border-r-0" key={heading}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.length ? (
            logs.map((log) => {
              const booking = log.new_value ?? log.old_value ?? {};
              return (
                <tr className="border-b border-slate-100 last:border-b-0" key={log.id}>
                  <td className="px-3 py-3 font-semibold text-slate-700">{formatDateTime(log.created_at)}</td>
                  <td className="px-3 py-3 font-black capitalize text-slate-950">{log.action}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{log.actor_name || "-"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{booking.room_name || "-"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{formatDate(String(booking.booking_date ?? ""))}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">
                    {booking.from_time && booking.to_time ? `${formatTime(String(booking.from_time))} - ${formatTime(String(booking.to_time))}` : "-"}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{booking.team_name || "-"}</td>
                  <td className="max-w-[280px] px-3 py-3 font-semibold text-slate-700">{booking.purpose || "-"}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td className="px-3 py-8 text-center font-bold text-slate-500" colSpan={8}>
                No meeting room booking log entries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function validateDraft(draft: Booking, bookings: Booking[], editingId: string) {
  if (!draft.booking_date || !draft.room_name || !draft.from_time || !draft.to_time || !draft.team_name || !draft.purpose.trim()) {
    return "Date, room, time, team, and purpose are required.";
  }

  const duration = minutesFromTime(draft.to_time) - minutesFromTime(draft.from_time);

  if (duration <= 0) {
    return "Please choose a To time after the From time.";
  }

  if (duration > 120) {
    return "Maximum booking slot is 2 hours.";
  }

  const overlaps = bookings.some((booking) =>
    booking.id !== editingId &&
    booking.booking_date === draft.booking_date &&
    booking.room_name === draft.room_name &&
    draft.from_time < booking.to_time &&
    draft.to_time > booking.from_time
  );

  return overlaps ? `${draft.room_name} already has a booking during this time.` : "";
}

function todayValue() {
  return toDateValue(new Date());
}

function dateAfterDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateValue(date);
}

function toDateValue(date: Date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}, ${date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit"
  })}`;
}

function formatTime(value: string) {
  const [hourText, minute] = value.split(":");
  const date = new Date();
  date.setHours(Number(hourText), Number(minute));
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit"
  });
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
