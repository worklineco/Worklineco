"use client";

import { Bell, CalendarClock, ListChecks, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type TaskNotification = {
  due_date: string;
  entity: string;
  id: string;
  kind: "assigned" | "due_tomorrow";
  occurred_at: string;
  task: string;
};

const notificationSeenStorageKey = "wl_task_notification_seen_v1";
const notificationRefreshMs = 60_000;

export function TaskNotificationBell() {
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const response = await fetch("/api/taskline?view=notifications", { cache: "no-store" });
        const result = (await response.json()) as { error?: string; notifications?: TaskNotification[] };

        if (!response.ok) {
          throw new Error(result.error ?? "Could not load task notifications.");
        }

        if (cancelled) return;
        const nextNotifications = result.notifications ?? [];
        const seenIds = readSeenNotificationIds();
        setNotifications(nextNotifications);
        setUnreadIds(nextNotifications.map((item) => item.id).filter((id) => !seenIds.has(id)));
        setError("");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load task notifications.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void loadNotifications();
      }
    }

    void loadNotifications();
    const intervalId = window.setInterval(loadNotifications, notificationRefreshMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function toggleNotifications() {
    setIsOpen((current) => {
      const next = !current;
      if (next) {
        markNotificationsRead(notifications);
        setUnreadIds([]);
      }
      return next;
    });
  }

  const unreadCount = unreadIds.length;

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        aria-controls="task-notification-panel"
        aria-expanded={isOpen}
        aria-label={unreadCount ? `Task notifications, ${unreadCount} unread` : "Task notifications"}
        className="relative flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-navy-700 shadow-sm transition hover:-translate-y-0.5 hover:border-navy-200 hover:bg-navy-50 hover:shadow-md"
        onClick={toggleNotifications}
        title="Task notifications"
        type="button"
      >
        <Bell className="size-5" />
        {unreadCount ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-5 text-white ring-2 ring-[#f4f6fa]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <span aria-live="polite" className="sr-only">
        {unreadCount ? `${unreadCount} unread task notifications` : "No unread task notifications"}
      </span>

      {isOpen ? (
        <section
          aria-label="Task notifications"
          className="absolute right-0 top-full z-50 mt-3 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.18)]"
          id="task-notification-panel"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
            <div>
              <h2 className="text-sm font-bold text-slate-950">Task notifications</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">New allotments and tasks due tomorrow</p>
            </div>
            <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[11px] font-bold text-navy-700">
              {notifications.length}
            </span>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm font-semibold text-slate-500">
                <LoaderCircle className="size-4 animate-spin" />
                Loading alerts...
              </div>
            ) : error ? (
              <div className="rounded-xl bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-700">{error}</div>
            ) : notifications.length ? (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} onOpen={() => setIsOpen(false)} />
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <Bell className="size-4" />
                </div>
                <p className="mt-3 text-sm font-bold text-slate-800">No task alerts right now</p>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-500">Newly allotted tasks and tomorrow's due tasks will appear here.</p>
              </div>
            )}
          </div>

          <Link
            className="flex items-center justify-center border-t border-slate-100 px-4 py-3 text-xs font-bold text-navy-700 transition hover:bg-navy-50"
            href="/taskline"
            onClick={() => setIsOpen(false)}
          >
            Open Taskline
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function NotificationItem({ notification, onOpen }: { notification: TaskNotification; onOpen: () => void }) {
  const isDueTomorrow = notification.kind === "due_tomorrow";
  const Icon = isDueTomorrow ? CalendarClock : ListChecks;

  return (
    <Link
      className="block rounded-xl border border-slate-100 px-3.5 py-3 transition hover:border-navy-100 hover:bg-navy-50/60"
      href="/taskline"
      onClick={onOpen}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${
          isDueTomorrow ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
        }`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold uppercase tracking-[0.1em] ${
            isDueTomorrow ? "text-amber-700" : "text-sky-700"
          }`}>
            {isDueTomorrow ? "Due tomorrow" : "New task allotted"}
          </p>
          <p className="mt-1 truncate text-sm font-bold text-slate-900">
            {notification.entity || "Entity not specified"}
          </p>
          <dl className="mt-2 grid grid-cols-[62px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs leading-5">
            <dt className="font-semibold text-slate-400">Task</dt>
            <dd className="truncate font-semibold text-slate-700">{notification.task || "Not specified"}</dd>
            <dt className="font-semibold text-slate-400">Due date</dt>
            <dd className="font-semibold text-slate-700">{formatDueDate(notification.due_date)}</dd>
          </dl>
        </div>
      </div>
    </Link>
  );
}

function readSeenNotificationIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(notificationSeenStorageKey) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function markNotificationsRead(notifications: TaskNotification[]) {
  const seenIds = readSeenNotificationIds();
  notifications.forEach((notification) => seenIds.add(notification.id));
  window.localStorage.setItem(notificationSeenStorageKey, JSON.stringify(Array.from(seenIds).slice(-500)));
}

function formatDueDate(value: string) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return value || "Not set";
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC", year: "numeric" });
}
