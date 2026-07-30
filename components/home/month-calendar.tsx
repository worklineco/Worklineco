"use client";

import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CalendarEvent = {
  due_date: string;
  entity: string;
  name?: string;
  stage?: string;
  task: string;
};

export function MonthCalendar({
  events = [],
  notes = {},
  onAddNote,
  onDeleteNote,
  onEditNote
}: {
  events?: CalendarEvent[];
  notes?: Record<string, string[]>;
  onAddNote?: (dateKey: string, text: string) => void;
  onDeleteNote?: (dateKey: string, index: number) => void;
  onEditNote?: (dateKey: string, index: number, text: string) => void;
}) {
  const today = new Date();
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const calendarCells = useMemo(() => buildCalendarCells(monthDate), [monthDate]);
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);
  const monthLabel = monthDate.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const [selected, setSelected] = useState<{ dateKey: string; dateLabel: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  function changeMonth(offset: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function openDay(date: Date) {
    setSelected({ dateKey: formatDayKey(date), dateLabel: formatFullDate(date) });
    setNoteDraft("");
  }

  const selectedEvents = selected ? eventsByDay.get(selected.dateKey) ?? [] : [];
  const selectedNotes = selected ? notes[selected.dateKey] ?? [] : [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-950">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <button aria-label="Previous month" className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50" onClick={() => changeMonth(-1)} type="button">
            <ChevronLeft className="size-4" />
          </button>
          <button aria-label="Next month" className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50" onClick={() => changeMonth(1)} type="button">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-navy-700 text-white">
          {weekDays.map((day) => (
            <div className="px-2 py-2 text-center text-[11px] font-black uppercase" key={day}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarCells.map((cell, index) => {
            const isToday =
              cell.isCurrentMonth &&
              cell.date.getDate() === today.getDate() &&
              cell.date.getMonth() === today.getMonth() &&
              cell.date.getFullYear() === today.getFullYear();
            const dayKey = formatDayKey(cell.date);
            const dayEvents = eventsByDay.get(dayKey) ?? [];
            const dayNotes = notes[dayKey] ?? [];
            const visibleEvents = dayEvents.slice(0, 2);
            const hiddenCount = dayEvents.length - visibleEvents.length + Math.max(0, dayNotes.length - 2);

            return (
              <div
                className={`flex min-h-[104px] flex-col border-b border-r border-slate-200 p-2 ${cell.isCurrentMonth ? "bg-white" : "bg-slate-50 text-slate-300"} ${index % 7 === 6 ? "border-r-0" : ""}`}
                key={cell.key}
              >
                <button
                  className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black transition hover:ring-2 hover:ring-navy-300 ${isToday ? "bg-navy-700 text-white" : "text-slate-700"}`}
                  onClick={() => openDay(cell.date)}
                  title="Open day / add note"
                  type="button"
                >
                  {cell.date.getDate()}
                </button>
                <div className="mt-1 flex flex-col gap-1">
                  {visibleEvents.map((event, eventIndex) => (
                    <div
                      className="rounded-md border border-navy-100 bg-navy-50 px-1.5 py-1 text-left leading-tight"
                      key={`e-${cell.key}-${eventIndex}`}
                      title={[event.name, event.entity, event.task, event.stage].filter(Boolean).join(" • ")}
                    >
                      {event.entity ? <p className="truncate text-[11px] font-bold text-navy-800">{event.entity}</p> : null}
                      {event.task ? <p className="truncate text-[10px] font-medium text-slate-600">{event.task}</p> : null}
                    </div>
                  ))}
                  {dayNotes.slice(0, 2).map((note, noteIndex) => (
                    <div className="truncate rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] font-semibold text-amber-800" key={`n-${cell.key}-${noteIndex}`} title={note}>
                      {note}
                    </div>
                  ))}
                  {hiddenCount > 0 ? (
                    <button className="self-start pl-0.5 text-[10px] font-bold text-navy-600 hover:underline" onClick={() => openDay(cell.date)} type="button">
                      +{hiddenCount} more
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 py-6" onClick={() => setSelected(null)}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <p className="text-sm font-black text-slate-950">{selected.dateLabel}</p>
              <button className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setSelected(null)} type="button">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {selectedEvents.length ? (
                <>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Tasks</p>
                  {selectedEvents.map((event, i) => (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" key={`se-${i}`}>
                      {event.entity ? <p className="text-sm font-black text-slate-950">{event.entity}</p> : null}
                      {event.name ? <p className="text-xs font-bold text-slate-500">{event.name}</p> : null}
                      {event.task ? <p className="mt-0.5 text-xs font-semibold text-slate-700">{event.task}</p> : null}
                      {event.stage ? <span className="mt-1 inline-block rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-navy-700">{event.stage}</span> : null}
                    </div>
                  ))}
                </>
              ) : null}
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Notes</p>
              {selectedNotes.length ? (
                selectedNotes.map((note, i) => (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2" key={`sn-${i}`}>
                    <p className="min-w-0 flex-1 text-sm font-semibold text-amber-900">{note}</p>
                    {onEditNote ? (
                      <button
                        className="shrink-0 text-amber-700 hover:text-navy-700"
                        onClick={() => {
                          const value = window.prompt("Edit note", note)?.trim();
                          if (value) {
                            onEditNote(selected.dateKey, i, value);
                          }
                        }}
                        title="Edit note"
                        type="button"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    ) : null}
                    {onDeleteNote ? (
                      <button className="shrink-0 text-amber-700 hover:text-rose-600" onClick={() => onDeleteNote(selected.dateKey, i)} title="Delete note" type="button">
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-xs font-semibold text-slate-400">No notes for this day.</p>
              )}
            </div>
            {onAddNote ? (
              <div className="flex gap-2 border-t border-slate-200 px-4 py-3">
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-navy-400"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && noteDraft.trim()) {
                      onAddNote(selected.dateKey, noteDraft.trim());
                      setNoteDraft("");
                    }
                  }}
                  placeholder="Add a note for this date"
                  value={noteDraft}
                />
                <button
                  className="inline-flex size-10 items-center justify-center rounded-md bg-navy-700 text-white transition hover:bg-navy-800 disabled:opacity-50"
                  disabled={!noteDraft.trim()}
                  onClick={() => {
                    if (noteDraft.trim()) {
                      onAddNote(selected.dateKey, noteDraft.trim());
                      setNoteDraft("");
                    }
                  }}
                  type="button"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function groupEventsByDay(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = (event.due_date ?? "").trim();
    if (!key) {
      continue;
    }
    const existing = map.get(key);
    if (existing) {
      existing.push(event);
    } else {
      map.set(key, [event]);
    }
  }
  return map;
}

function formatDayKey(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function buildCalendarCells(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      date,
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
      key: date.toISOString()
    };
  });
}
