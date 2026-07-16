"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthCalendar() {
  const today = new Date();
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const calendarCells = useMemo(() => buildCalendarCells(monthDate), [monthDate]);
  const monthLabel = monthDate.toLocaleString("en-IN", { month: "long", year: "numeric" });

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

            return (
              <div
                className={`min-h-20 border-b border-r border-slate-200 p-2 ${
                  cell.isCurrentMonth ? "bg-white" : "bg-slate-50 text-slate-300"
                } ${index % 7 === 6 ? "border-r-0" : ""}`}
                key={cell.key}
              >
                <span
                  className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-black ${
                    isToday ? "bg-navy-700 text-white" : "text-slate-700"
                  }`}
                >
                  {cell.date.getDate()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
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
