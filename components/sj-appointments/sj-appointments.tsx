"use client";

import { ArrowLeft, CalendarDays, Clock3, Edit3, RefreshCw, Trash2, UsersRound } from "lucide-react";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { clearCached } from "@/lib/data-cache";

type Appointment = {
  appointment_date: string;
  from_time: string;
  id?: string;
  notes: string;
  purpose: string;
  title: string;
  to_time: string;
};
type AppointmentLog = {
  action: string;
  actor_name?: string;
  created_at: string;
  id: string;
  new_value?: Partial<Appointment> | null;
  old_value?: Partial<Appointment> | null;
};
type ViewMode = "board" | "log";

const purposeOptions = [
  "Client Meeting",
  "Internal Discussion",
  "Review / Planning",
  "Hearing / Proceeding",
  "Personal Appointment",
  "Other"
];

function emptyDraft(date = todayValue()): Appointment {
  return {
    appointment_date: date,
    from_time: "10:00",
    notes: "",
    purpose: "",
    title: "",
    to_time: "11:00"
  };
}

export function SJAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [boardDate, setBoardDate] = useState(todayValue());
  const [draft, setDraft] = useState<Appointment>(() => emptyDraft());
  const [editingId, setEditingId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<AppointmentLog[]>([]);
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("board");

  const dayAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.appointment_date === boardDate)
        .sort((first, second) => normalizeTime(first.from_time).localeCompare(normalizeTime(second.from_time))),
    [appointments, boardDate]
  );

  useEffect(() => {
    void loadAppointments();
  }, []);

  async function loadAppointments() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/sj-appointments", { cache: "no-store" });
      const result = (await response.json()) as {
        appointments?: Appointment[];
        error?: string;
        logs?: AppointmentLog[];
      };
      if (!response.ok) {
        setMessage(result.error ?? "Could not load SJ Appointments.");
        return;
      }
      setAppointments(result.appointments ?? []);
      setLogs(result.logs ?? []);
      setMessage("");
    } catch {
      setMessage("Could not load SJ Appointments.");
    } finally {
      setIsLoading(false);
    }
  }

  function updateDraft(field: keyof Appointment, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (field === "appointment_date") setBoardDate(value);
  }

  async function saveAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateDraft(draft, appointments, editingId);
    if (validation) {
      setMessage(validation);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/sj-appointments", {
        body: JSON.stringify({ appointment: { ...draft, id: editingId || undefined } }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as {
        appointments?: Appointment[];
        emailWarning?: string;
        error?: string;
        logs?: AppointmentLog[];
      };
      if (!response.ok) {
        setMessage(result.error ?? "Could not save the appointment.");
        return;
      }

      setAppointments(result.appointments ?? []);
      setLogs(result.logs ?? []);
      clearCached("sj-appointments");
      const wasEditing = Boolean(editingId);
      resetForm(draft.appointment_date);
      setMessage(
        result.emailWarning ||
          (wasEditing ? "Appointment updated." : "Appointment booked. Somya has been emailed.")
      );
    } catch {
      setMessage("Could not save the appointment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAppointment(appointment: Appointment) {
    if (!window.confirm(`Delete the appointment “${appointment.title}”?`)) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/sj-appointments", {
        body: JSON.stringify({ action: "delete", id: appointment.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as {
        appointments?: Appointment[];
        error?: string;
        logs?: AppointmentLog[];
      };
      if (!response.ok) {
        setMessage(result.error ?? "Could not delete the appointment.");
        return;
      }
      setAppointments(result.appointments ?? []);
      setLogs(result.logs ?? []);
      if (editingId === appointment.id) resetForm(boardDate);
      setMessage("Appointment deleted.");
    } catch {
      setMessage("Could not delete the appointment.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(appointment: Appointment) {
    setEditingId(appointment.id ?? "");
    setBoardDate(appointment.appointment_date);
    setDraft({
      ...appointment,
      from_time: normalizeTime(appointment.from_time),
      to_time: normalizeTime(appointment.to_time)
    });
    setMessage("Editing selected appointment.");
  }

  function resetForm(date = boardDate) {
    setEditingId("");
    setDraft(emptyDraft(date));
  }

  const isError = /could not|already|required|after the from|maximum/i.test(message);

  return (
    <main className="min-h-screen bg-[#f4f6fa] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-[1500px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-black uppercase text-violet-800">
                <UsersRound className="size-3.5" />
                Private schedule
              </div>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">SJ Appointments</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Shared appointment schedule for Jatin and Somya. Slots are limited to 2 hours and conflicting appointments are blocked.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800"
                onClick={() => void loadAppointments()}
                type="button"
              >
                <RefreshCw className="size-4" />
                Refresh
              </button>
              <Link
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy-700 px-4 text-sm font-black text-white"
                href="/partner-dashboard"
              >
                <ArrowLeft className="size-4" />
                Workspace
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <form className="workline-panel grid gap-4 rounded-[24px] p-5 xl:sticky xl:top-5" onSubmit={saveAppointment}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-navy-700">
                  {editingId ? "Edit appointment" : "New appointment"}
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  {editingId ? "Update Appointment" : "Book Appointment"}
                </h2>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Max 2 hr</span>
            </div>

            <FormField label="Appointment Date">
              <input
                className="input rounded-md"
                max={dateAfterDays(6)}
                min={todayValue()}
                onChange={(event) => updateDraft("appointment_date", event.target.value)}
                type="date"
                value={draft.appointment_date}
              />
            </FormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="From">
                <input className="input rounded-md" onChange={(event) => updateDraft("from_time", event.target.value)} step="300" type="time" value={normalizeTime(draft.from_time)} />
              </FormField>
              <FormField label="To">
                <input className="input rounded-md" onChange={(event) => updateDraft("to_time", event.target.value)} step="300" type="time" value={normalizeTime(draft.to_time)} />
              </FormField>
            </div>

            <FormField label="Appointment Title">
              <input
                className="input rounded-md"
                onChange={(event) => updateDraft("title", event.target.value)}
                placeholder="Enter appointment title"
                value={draft.title}
              />
            </FormField>

            <FormField label="Purpose">
              <select className="input rounded-md" onChange={(event) => updateDraft("purpose", event.target.value)} value={draft.purpose}>
                <option value="">Select purpose</option>
                {purposeOptions.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
              </select>
            </FormField>

            <FormField label="Notes">
              <textarea
                className="input min-h-24 rounded-md py-3"
                onChange={(event) => updateDraft("notes", event.target.value)}
                placeholder="Optional details"
                value={draft.notes}
              />
            </FormField>

            {message ? (
              <p className={`rounded-md border px-3 py-2 text-sm font-bold ${isError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                {message}
              </p>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <button className="inline-flex h-12 items-center justify-center rounded-md bg-navy-700 px-4 text-sm font-black text-white disabled:opacity-60" disabled={isSaving} type="submit">
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
                <p className="text-xs font-black uppercase tracking-[0.14em] text-navy-700">
                  {viewMode === "board" ? "Appointment Board" : "Booking Log"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {viewMode === "board" ? `${formatDate(boardDate)} Appointments` : "SJ Appointment Booking Log"}
                </h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-[130px_180px]">
                <Summary label="Appointments" value={String(dayAppointments.length)} />
                <FormField label="View Date">
                  <input
                    className="input h-11 rounded-md"
                    max={dateAfterDays(6)}
                    min={todayValue()}
                    onChange={(event) => {
                      setBoardDate(event.target.value);
                      if (!editingId) setDraft((current) => ({ ...current, appointment_date: event.target.value }));
                    }}
                    type="date"
                    value={boardDate}
                  />
                </FormField>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              <button className={`h-10 rounded-md px-3 text-sm font-black ${viewMode === "board" ? "bg-navy-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`} onClick={() => setViewMode("board")} type="button">
                Board
              </button>
              <button className={`h-10 rounded-md px-3 text-sm font-black ${viewMode === "log" ? "bg-navy-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`} onClick={() => setViewMode("log")} type="button">
                Booking Log
              </button>
            </div>

            {viewMode === "board" ? (
              <div className="mt-5 space-y-3">
                {isLoading ? (
                  <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500">Loading appointments...</p>
                ) : dayAppointments.length ? (
                  dayAppointments.map((appointment) => (
                    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={appointment.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-black text-navy-700">
                            <Clock3 className="size-4" />
                            {formatTime(appointment.from_time)} – {formatTime(appointment.to_time)}
                          </div>
                          <h3 className="mt-2 text-lg font-black text-slate-950">{appointment.title}</h3>
                          <p className="mt-1 text-sm font-bold text-slate-600">{appointment.purpose}</p>
                          {appointment.notes ? <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-500">{appointment.notes}</p> : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-navy-700 hover:bg-navy-50" onClick={() => startEdit(appointment)} title="Edit appointment" type="button">
                            <Edit3 className="size-4" />
                          </button>
                          <button className="inline-flex size-9 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => void deleteAppointment(appointment)} title="Delete appointment" type="button">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
                    <CalendarDays className="mx-auto size-8 text-slate-400" />
                    <p className="mt-3 text-sm font-black text-slate-600">No appointments booked for this date.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="bg-slate-100 text-xs font-black uppercase text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Date & Time</th>
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">Changed By</th>
                        <th className="px-4 py-3">Appointment</th>
                        <th className="px-4 py-3">Purpose</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.length ? logs.map((log) => {
                        const value = log.new_value ?? log.old_value ?? {};
                        return (
                          <tr key={log.id}>
                            <td className="px-4 py-3 font-semibold text-slate-600">{formatDateTime(log.created_at)}</td>
                            <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black uppercase text-slate-700">{log.action}</span></td>
                            <td className="px-4 py-3 font-bold text-slate-800">{log.actor_name || "WorkLine user"}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{value.title || "—"}</td>
                            <td className="px-4 py-3 font-semibold text-slate-600">{value.purpose || "—"}</td>
                          </tr>
                        );
                      }) : (
                        <tr><td className="px-4 py-8 text-center font-semibold text-slate-500" colSpan={5}>No booking log entries yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

function FormField({ children, label }: { children: ReactNode; label: string }) {
  return <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-slate-600">{label}{children}</label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function validateDraft(draft: Appointment, appointments: Appointment[], editingId: string) {
  if (!draft.appointment_date || !draft.from_time || !draft.to_time || !draft.title.trim() || !draft.purpose) {
    return "Date, time, title, and purpose are required.";
  }
  const duration = minutesFromTime(draft.to_time) - minutesFromTime(draft.from_time);
  if (duration <= 0) return "Choose a To time after the From time.";
  if (duration > 120) return "Maximum appointment slot is 2 hours.";
  const overlaps = appointments.some(
    (appointment) =>
      appointment.id !== editingId &&
      appointment.appointment_date === draft.appointment_date &&
      normalizeTime(appointment.from_time) < normalizeTime(draft.to_time) &&
      normalizeTime(appointment.to_time) > normalizeTime(draft.from_time)
  );
  return overlaps ? "Another SJ appointment already exists during this time." : "";
}

function normalizeTime(value: string) {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}` : "";
}

function minutesFromTime(value: string) {
  const [hour, minute] = normalizeTime(value).split(":").map(Number);
  return hour * 60 + minute;
}

function formatTime(value: string) {
  const [hour, minute] = normalizeTime(value).split(":").map(Number);
  if (!Number.isFinite(hour)) return value;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function todayValue() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dateAfterDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
