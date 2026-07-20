"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CalendarEvent = {
  due_date: string;
  entity: string;
  name?: string;
  stage?: string;
  task: string;
};

export function MonthCalendar({ events = [] }: { events?: CalendarEvent[] }) {
  const today = new Date();
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const calendarCells = useMemo(() => buildCalendarCells(monthDate), [monthDate]);
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);
  const monthLabel = monthDate.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const [selectedDay, setSelectedDay] = useState<{ dateLabel: string; events: CalendarEvent[] } | null>(null);

  function changeMonth(offset: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <section className="workline-frame mt-5 rounded-[26px] p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1.5 text-xs font-black uppercase text-sky-800">
            <CalendarDays className="size-3.5" />
            Calendar
          </div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">{monthLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous month"
            className="flex size-10 items-center justify-center rounded-xl border border-slate-950/10 bg-white text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            onClick={() => changeMonth(-1)}
            type="button"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            aria-label="Next month"
            className="flex size-10 items-center justify-center rounded-xl border border-slate-950/10 bg-white text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            onClick={() => changeMonth(1)}
            type="button"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-950/10 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-navy-700 text-white">
          {weekDays.map((day) => (
            <div className="px-2 py-2 text-center text-[11px] font-black uppercase" key={day}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarCells.map((cell, index) => {
            const isToday =
              cell.isCurrentMonth &&
              cell.date.getDate() === today.getDate() &&
              cell.date.getMonth() === today.getMonth() &&
              cell.date.getFullYear() === today.getFullYear();

            const dayEvents = eventsByDay.get(formatDayKey(cell.date)) ?? [];
            const visibleEvents = dayEvents.slice(0, 3);
            const extraCount = dayEvents.length - visibleEvents.length;

            return (
              <div
                className={`flex min-h-[104px] flex-col border-b border-r border-slate-200 p-2 ${
                  cell.isCurrentMonth ? "bg-white" : "bg-slate-50 text-slate-300"
                } ${index % 7 === 6 ? "border-r-0" : ""}`}
                key={cell.key}
              >
                {dayEvents.length > 0 ? (
                  <button
                    className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black transition hover:ring-2 hover:ring-navy-300 ${
                      isToday ? "bg-navy-700 text-white" : "text-slate-700"
                    }`}
                    onClick={() => setSelectedDay({ dateLabel: formatFullDate(cell.date), events: dayEvents })}
                    title="View all tasks"
                    type="button"
                  >
                    {cell.date.getDate()}
                  </button>
                ) : (
                  <span
                    className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      isToday ? "bg-navy-700 text-white" : "text-slate-700"
                    }`}
                  >
                    {cell.date.getDate()}
                  </span>
                )}
                {dayEvents.length > 0 ? (
                  <div className="mt-1 flex flex-col gap-1">
                    {visibleEvents.map((event, eventIndex) => (
                      <div
                        className="rounded-md border border-navy-100 bg-navy-50 px-1.5 py-1 text-left leading-tight"
                        key={`${cell.key}-${eventIndex}`}
                        title={[event.name, event.entity, event.task, event.stage].filter(Boolean).join(" • ")}
                      >
                        {event.entity ? (
                          <p className="truncate text-[11px] font-bold text-navy-800">{event.entity}</p>
                        ) : null}
                        {event.task ? (
                          <p className="truncate text-[10px] font-medium text-slate-600">{event.task}</p>
                        ) : null}
                        {event.stage ? (
                          <span className="mt-0.5 inline-block rounded bg-navy-100 px-1 py-0.5 text-[9px] font-black uppercase leading-none text-navy-700">
                            {event.stage}
                          </span>
                        ) : null}
                      </div>
                    ))}
                    {extraCount > 0 ? (
                      <button
                        className="mt-0.5 self-start pl-0.5 text-[10px] font-bold text-navy-600 hover:text-navy-800 hover:underline"
                        onClick={() => setSelectedDay({ dateLabel: formatFullDate(cell.date), events: dayEvents })}
                        type="button"
                      >
                        +{extraCount} more
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 py-6"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-navy-700">{selectedDay.dateLabel}</p>
                <h3 className="mt-0.5 text-lg font-black text-slate-950">
                  {selectedDay.events.length} task{selectedDay.events.length === 1 ? "" : "s"}
                </h3>
              </div>
              <button
                className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setSelectedDay(null)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {selectedDay.events.map((event, index) => (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" key={index}>
                  {event.entity ? <p className="text-sm font-black text-slate-950">{event.entity}</p> : null}
                  {event.name ? <p className="text-xs font-bold text-slate-500">{event.name}</p> : null}
                  {event.task ? <p className="mt-0.5 text-xs font-semibold text-slate-700">{event.task}</p> : null}
                  {event.stage ? (
                    <span className="mt-1 inline-block rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-navy-700">
                      {event.stage}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
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
