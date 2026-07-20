"use client";

import { useEffect, useState } from "react";
import { MonthCalendar, type CalendarEvent } from "@/components/home/month-calendar";
import { getCached, setCached } from "@/lib/data-cache";

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    let active = true;

    const cached = getCached<CalendarEvent[]>("dashboard_calendar");
    if (cached) {
      setEvents(cached);
    }

    fetch("/api/taskline?view=calendar", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((data) => {
        if (active) {
          const next = Array.isArray(data?.events) ? (data.events as CalendarEvent[]) : [];
          setEvents(next);
          setCached("dashboard_calendar", next);
        }
      })
      .catch(() => {
        if (active && !cached) {
          setEvents([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <div className="mx-auto w-full max-w-none px-3 py-5 sm:px-5 lg:px-8">
        <header className="mb-1">
          <h1 className="text-3xl font-bold text-navy-700">Calendar</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Your TaskLine due dates, by month.</p>
        </header>
        <MonthCalendar events={events} />
      </div>
    </main>
  );
}
