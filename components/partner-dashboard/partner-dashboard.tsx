"use client";

import { getCurrentUser } from "@/lib/supabase/session";
import { MessagesSquare, NotebookPen, Pencil, Plus, Send, Target, Trash2, X } from "lucide-react";
import { MonthCalendar, type CalendarEvent } from "@/components/home/month-calendar";
import { TaskNotificationBell } from "@/components/home/task-notification-bell";
import { clearPersistentDataCache, getCached, setCached } from "@/lib/data-cache";
import { PendencyReport } from "@/components/partner-dashboard/pendency-report";
import { useEffect, useRef, useState } from "react";

type NoteTask = { color: string; done: boolean; id: string; targetDate: string; text: string };
type NoteFile = { date?: string; id: string; tasks: NoteTask[]; title: string; updatedAt: string };
type DashboardState = { calendarNotes: Record<string, string[]>; notes: NoteFile[] };
type Thread = { count: number; entity: string; last_at: string; last_body: string; messages: ChatMessage[]; task: string; task_code: string; team: string };
type ChatMessage = { author_name?: string; body: string; created_at: string; id: string };

const storageKey = "workline-partner-dashboard";
const chatReadsKey = "wl_dashboard_chat_reads";
const chatHiddenKey = "wl_dashboard_chat_hidden";
const noteLineColorFills: Record<string, string> = {
  "": "transparent",
  red: "#fee2e2",
  amber: "#fef3c7",
  green: "#dcfce7",
  blue: "#dbeafe",
  purple: "#ede9fe"
};
const noteLineColorSwatches: { key: string; label: string; ring: string }[] = [
  { key: "red", label: "Red", ring: "#ef4444" },
  { key: "amber", label: "Amber", ring: "#f59e0b" },
  { key: "green", label: "Green", ring: "#22c55e" },
  { key: "blue", label: "Blue", ring: "#3b82f6" },
  { key: "purple", label: "Purple", ring: "#8b5cf6" }
];
const defaultState: DashboardState = {
  calendarNotes: {},
  notes: [
    {
      id: "note-1",
      tasks: [{ color: "", done: false, id: "task-1", targetDate: "", text: "" }],
      title: "Daily Scratchpad",
      updatedAt: new Date().toISOString()
    }
  ]
};

/** Shape of notes saved before the scratchpad became a task list. */
type LegacyNoteFields = { content?: unknown; lineColors?: unknown; lineStruck?: unknown; targetDate?: unknown };

/**
 * Read a note's tasks, converting notes saved in the old free-text format:
 * each line becomes a task, carrying over the colour and strike it had.
 */
function restoreNoteTasks(note: Partial<NoteFile> & LegacyNoteFields, noteIndex: number): NoteTask[] {
  if (Array.isArray(note.tasks)) {
    const tasks = note.tasks.flatMap((task, index) => {
      if (!task || typeof task !== "object") {
        return [];
      }
      const item = task as Partial<NoteTask>;
      return [{
        color: typeof item.color === "string" && item.color in noteLineColorFills ? item.color : "",
        done: item.done === true,
        id: typeof item.id === "string" && item.id ? item.id : `task-${noteIndex + 1}-${index + 1}`,
        targetDate: typeof item.targetDate === "string" ? item.targetDate : "",
        text: typeof item.text === "string" ? item.text : ""
      }];
    });
    return tasks.length ? tasks : [blankNoteTask()];
  }

  if (typeof note.content !== "string") {
    return [blankNoteTask()];
  }

  const colors = Array.isArray(note.lineColors) ? note.lineColors : [];
  const struck = Array.isArray(note.lineStruck) ? note.lineStruck : [];
  const tasks = note.content
    .split("\n")
    .map((line, index) => ({
      color: typeof colors[index] === "string" && (colors[index] as string) in noteLineColorFills ? (colors[index] as string) : "",
      done: struck[index] === true,
      id: `task-${noteIndex + 1}-${index + 1}`,
      // Drop the old "1. " numbering; rows are numbered by position now.
      targetDate: typeof note.targetDate === "string" ? note.targetDate : "",
      text: line.replace(/^\s*\d+\.\s?/, "").trim()
    }))
    .filter((task) => task.text);

  return tasks.length ? tasks : [blankNoteTask()];
}

function blankNoteTask(): NoteTask {
  return { color: "", done: false, id: makeTaskId(), targetDate: "", text: "" };
}

function makeTaskId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `task-${Math.random().toString(36).slice(2)}`;
}

function restoreDashboardState(saved: string): DashboardState | null {
  try {
    const parsed = JSON.parse(saved) as Partial<DashboardState> | null;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const calendarNotes =
      parsed.calendarNotes && typeof parsed.calendarNotes === "object" && !Array.isArray(parsed.calendarNotes)
        ? Object.fromEntries(
            Object.entries(parsed.calendarNotes)
              .filter(([, notes]) => Array.isArray(notes))
              .map(([dateKey, notes]) => [dateKey, notes.filter((note): note is string => typeof note === "string")])
          )
        : {};

    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.flatMap((note, index) => {
          if (!note || typeof note !== "object") {
            return [];
          }
          const item = note as Partial<NoteFile> & LegacyNoteFields;
          return [{
            ...(typeof item.date === "string" ? { date: item.date } : {}),
            id: typeof item.id === "string" && item.id ? item.id : `saved-note-${index + 1}`,
            tasks: restoreNoteTasks(item, index),
            title: typeof item.title === "string" && item.title.trim() ? item.title : `Note ${index + 1}`,
            updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString()
          }];
        })
      : [];

    return {
      calendarNotes,
      notes: notes.length ? notes : defaultState.notes
    };
  } catch {
    return null;
  }
}

export function PartnerDashboard() {
  const [profileName, setProfileName] = useState("Partner");
  const [profileEmail, setProfileEmail] = useState("");
  const [isPartner, setIsPartner] = useState(false);
  const [state, setState] = useState<DashboardState>(defaultState);
  const [activeNoteId, setActiveNoteId] = useState(defaultState.notes[0]?.id ?? "");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [chats, setChats] = useState<Thread[]>([]);
  const [chatReads, setChatReads] = useState<Record<string, number>>({});
  const [chatHidden, setChatHidden] = useState<Record<string, number>>({});
  const [openChat, setOpenChat] = useState<{ code: string; count: number; entity: string; label: string; loading: boolean; messages: ChatMessage[]; task: string; team: string } | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [teamEmails, setTeamEmails] = useState<{ email: string; name: string }[]>([]);
  const [noteStorageWarning, setNoteStorageWarning] = useState("");
  const skipInitialDashboardSaveRef = useRef(true);
  const [focusTaskId, setFocusTaskId] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const restored = restoreDashboardState(saved);
      if (restored) {
        setState(restored);
        setActiveNoteId(restored.notes[0]?.id ?? defaultState.notes[0]?.id ?? "");
      } else {
        setNoteStorageWarning("Saved Quick Notes could not be read. You can continue with a new note.");
      }
    }

    try {
      const savedReads = window.localStorage.getItem(chatReadsKey);
      if (savedReads) setChatReads(JSON.parse(savedReads) as Record<string, number>);
      const savedHidden = window.localStorage.getItem(chatHiddenKey);
      if (savedHidden) setChatHidden(JSON.parse(savedHidden) as Record<string, number>);
    } catch {
      // ignore corrupted local state
    }

    const cachedEvents = getCached<CalendarEvent[]>("dashboard_calendar");
    if (cachedEvents) {
      setEvents(cachedEvents);
    }
    fetch("/api/taskline?view=calendar", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((data) => {
        const next = Array.isArray(data?.events) ? (data.events as CalendarEvent[]) : [];
        setEvents(next);
        setCached("dashboard_calendar", next);
      })
      .catch(() => undefined);

    getCurrentUser().then((user) => {
      const metadata = user?.user_metadata ?? {};
      setProfileName(String(metadata.full_name ?? metadata.name ?? user?.email ?? "Partner").trim() || "Partner");
      setProfileEmail(user?.email ?? "");
    });

    // Designation comes from trusted role metadata, so the pendency report is
    // only rendered for partners. The API enforces the same check server-side.
    void fetch("/api/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((profile: { role?: string } | null) => {
        setIsPartner(String(profile?.role ?? "").toLowerCase().includes("partner"));
      })
      .catch(() => undefined);

    void loadChats();
  }, []);

  useEffect(() => {
    if (skipInitialDashboardSaveRef.current) {
      skipInitialDashboardSaveRef.current = false;
      return;
    }

    const serialized = JSON.stringify(state);
    try {
      window.localStorage.setItem(storageKey, serialized);
      setNoteStorageWarning("");
    } catch {
      clearPersistentDataCache();
      try {
        window.localStorage.setItem(storageKey, serialized);
        setNoteStorageWarning("");
      } catch {
        setNoteStorageWarning("Quick Notes could not be saved because browser storage is unavailable or full.");
      }
    }
  }, [state]);

  useEffect(() => {
    window.localStorage.setItem(chatReadsKey, JSON.stringify(chatReads));
  }, [chatReads]);

  useEffect(() => {
    window.localStorage.setItem(chatHiddenKey, JSON.stringify(chatHidden));
  }, [chatHidden]);

  const activeNote = state.notes.find((note) => note.id === activeNoteId) ?? state.notes[0];

  function addCalendarNote(dateKey: string, textValue: string) {
    setState((current) => ({
      ...current,
      calendarNotes: { ...current.calendarNotes, [dateKey]: [...(current.calendarNotes[dateKey] ?? []), textValue] }
    }));
  }

  function deleteCalendarNote(dateKey: string, index: number) {
    setState((current) => {
      const remaining = (current.calendarNotes[dateKey] ?? []).filter((_, i) => i !== index);
      const nextNotes = { ...current.calendarNotes };
      if (remaining.length) {
        nextNotes[dateKey] = remaining;
      } else {
        delete nextNotes[dateKey];
      }
      return { ...current, calendarNotes: nextNotes };
    });
  }

  function editCalendarNote(dateKey: string, index: number, textValue: string) {
    setState((current) => ({
      ...current,
      calendarNotes: {
        ...current.calendarNotes,
        [dateKey]: (current.calendarNotes[dateKey] ?? []).map((note, i) => (i === index ? textValue : note))
      }
    }));
  }

  function createNote() {
    const note: NoteFile = { id: makeTaskId(), tasks: [blankNoteTask()], title: `Note ${state.notes.length + 1}`, updatedAt: new Date().toISOString() };
    setState((current) => ({ ...current, notes: [note, ...current.notes] }));
    setActiveNoteId(note.id);
  }

  function renameNote(note: NoteFile) {
    const title = window.prompt("Rename note", note.title)?.trim();
    if (!title) {
      return;
    }
    setState((current) => ({
      ...current,
      notes: current.notes.map((item) => (item.id === note.id ? { ...item, title, updatedAt: new Date().toISOString() } : item))
    }));
  }

  function deleteNote(id: string) {
    setState((current) => {
      const notes = current.notes.filter((note) => note.id !== id);
      return {
        ...current,
        notes: notes.length
          ? notes
          : [{ id: makeTaskId(), tasks: [blankNoteTask()], title: "Note 1", updatedAt: new Date().toISOString() }]
      };
    });
    setActiveNoteId((current) => {
      const remaining = state.notes.filter((note) => note.id !== id);
      return current === id ? remaining[0]?.id ?? "" : current;
    });
  }

  function updateActiveNoteTasks(mutate: (tasks: NoteTask[]) => NoteTask[]) {
    if (!activeNote) {
      return;
    }
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === activeNote.id ? { ...note, tasks: mutate(note.tasks), updatedAt: new Date().toISOString() } : note
      )
    }));
  }

  function updateActiveNoteDate(date: string) {
    if (!activeNote) {
      return;
    }
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => (note.id === activeNote.id ? { ...note, date, updatedAt: new Date().toISOString() } : note))
    }));
  }

  /** Add a task, optionally right below an existing one. */
  function addNoteTask(afterId?: string) {
    const task = blankNoteTask();
    updateActiveNoteTasks((tasks) => {
      const at = afterId ? tasks.findIndex((item) => item.id === afterId) : -1;
      if (at < 0) {
        return [...tasks, task];
      }
      return [...tasks.slice(0, at + 1), task, ...tasks.slice(at + 1)];
    });
    setFocusTaskId(task.id);
  }

  function updateNoteTask(id: string, patch: Partial<NoteTask>) {
    updateActiveNoteTasks((tasks) => tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  function deleteNoteTask(id: string) {
    updateActiveNoteTasks((tasks) => {
      const remaining = tasks.filter((task) => task.id !== id);
      return remaining.length ? remaining : [blankNoteTask()];
    });
  }

  function clearDoneNoteTasks() {
    updateActiveNoteTasks((tasks) => {
      const remaining = tasks.filter((task) => !task.done);
      return remaining.length ? remaining : [blankNoteTask()];
    });
  }

  async function loadTeamEmails() {
    if (teamEmails.length) {
      return;
    }
    try {
      const response = await fetch("/api/teams", { cache: "no-store" });
      const result = await response.json();
      const members = Array.isArray(result?.members) ? (result.members as { email?: string; name?: string }[]) : [];
      setTeamEmails(
        members
          .map((member) => ({ email: String(member.email ?? "").trim(), name: String(member.name ?? "").trim() }))
          .filter((member) => member.email && member.email !== "-")
      );
    } catch {
      // ignore
    }
  }

  function pickChatEmail(email: string) {
    setChatDraft((current) => current.replace(/@([\w.+-]*)$/, `@${email} `));
  }

  async function loadChats() {
    try {
      const response = await fetch("/api/task-messages?view=threads", { cache: "no-store" });
      const result = await response.json();
      setChats(Array.isArray(result?.threads) ? (result.threads as Thread[]) : []);
    } catch {
      // ignore
    }
  }

  function chatLabel(thread: Thread) {
    return [thread.task_code, thread.entity, thread.task].filter(Boolean).join(" · ") || thread.task_code;
  }

  function unreadCount(thread: Thread) {
    return Math.max(0, thread.count - (chatReads[thread.task_code] ?? 0));
  }

  function openChatThread(thread: Thread) {
    void loadTeamEmails();
    setOpenChat({
      code: thread.task_code,
      count: thread.count,
      entity: thread.entity,
      label: chatLabel(thread),
      loading: false,
      messages: Array.isArray(thread.messages) ? thread.messages : [],
      task: thread.task,
      team: thread.team
    });
    setChatDraft("");
    setChatReads((current) => ({ ...current, [thread.task_code]: thread.count }));
  }

  async function sendChatMessage() {
    if (!openChat || !chatDraft.trim()) {
      return;
    }
    const bodyText = chatDraft.trim();
    const target = openChat;
    const optimistic = { author_name: "You", body: bodyText, created_at: new Date().toISOString(), id: `temp-${Date.now()}` };
    setOpenChat((current) => (current ? { ...current, count: current.count + 1, messages: [...current.messages, optimistic] } : current));
    setChatDraft("");
    setChatSending(true);
    setChatReads((current) => ({ ...current, [target.code]: (current[target.code] ?? 0) + 1 }));
    try {
      await fetch("/api/task-messages", {
        body: JSON.stringify({ body: bodyText, code: target.code, entity: target.entity, task: target.task, team: target.team }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      void loadChats();
    } catch {
      // optimistic message stays
    } finally {
      setChatSending(false);
    }
  }

  function hideChat(thread: Thread) {
    setChatHidden((current) => ({ ...current, [thread.task_code]: thread.count }));
  }

  const mentionMatch = chatDraft.match(/@([\w.+-]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : null;
  const emailSuggestions = mentionQuery !== null
    ? teamEmails.filter((member) => member.email.toLowerCase().includes(mentionQuery) || member.name.toLowerCase().includes(mentionQuery)).slice(0, 6)
    : [];

  const visibleChats = chats.filter((thread) => {
    const hiddenAt = chatHidden[thread.task_code];
    return hiddenAt === undefined || thread.count > hiddenAt;
  });
  const totalUnread = visibleChats.reduce((sum, thread) => sum + unreadCount(thread), 0);

  return (
    <div className="mt-4 grid gap-4">
      <section className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <h2 className="text-2xl font-black text-slate-950">{profileName}&rsquo;s Dashboard</h2>
          <p className="mt-1 truncate text-sm font-semibold text-slate-500">{profileEmail}</p>
        </div>
        <TaskNotificationBell />
      </section>

      {isPartner ? <PendencyReport /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <MessagesSquare className="size-5 text-navy-700" />
          <h3 className="text-base font-black text-slate-950">Task chats</h3>
          {totalUnread > 0 ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white">{totalUnread}</span> : null}
        </div>
        <div className="mt-3 divide-y divide-slate-100">
          {visibleChats.length ? (
            visibleChats.map((thread) => {
              const unread = unreadCount(thread);
              return (
                <div className="flex items-center gap-3 py-2.5" key={thread.task_code}>
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openChatThread(thread)} type="button">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${unread > 0 ? "bg-emerald-100 text-emerald-700" : "bg-navy-100 text-navy-700"}`}>
                      <MessagesSquare className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${unread > 0 ? "font-black text-slate-950" : "font-bold text-slate-800"}`}>{chatLabel(thread)}</span>
                      <span className="block truncate text-xs font-semibold text-slate-500">{thread.last_body}</span>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[10px] font-bold text-slate-400">{formatChatTime(thread.last_at)}</span>
                    {unread > 0 ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-black text-white">{unread}</span>
                    ) : null}
                  </div>
                  <button className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-rose-600" onClick={() => hideChat(thread)} title="Delete chat (hides it from your list until a new message arrives)" type="button">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="py-4 text-sm font-semibold text-slate-400">No task chats yet. Start one from Task Hub or by @mentioning a teammate.</p>
          )}
        </div>
      </section>

      {openChat ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 py-6" onClick={() => setOpenChat(null)}>
          <div className="wl-pop-in flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-navy-700">Task chat</p>
                <h3 className="mt-0.5 truncate text-base font-black text-slate-950">{openChat.label}</h3>
              </div>
              <button className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setOpenChat(null)} type="button">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {openChat.loading ? (
                <p className="text-sm font-bold text-slate-500">Loading…</p>
              ) : openChat.messages.length ? (
                openChat.messages.map((message) => (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" key={message.id}>
                    <p className="text-xs font-black text-navy-700">{message.author_name || "User"}</p>
                    <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">{message.body}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm font-semibold text-slate-400">No messages in this task yet.</p>
              )}
            </div>
            <div className="relative border-t border-slate-200 px-4 py-3">
              {emailSuggestions.length ? (
                <div className="absolute bottom-full left-4 right-4 mb-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                  {emailSuggestions.map((member) => (
                    <button
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
                      key={member.email}
                      onClick={() => pickChatEmail(member.email)}
                      type="button"
                    >
                      <span className="truncate text-sm font-black text-slate-800">{member.name || member.email}</span>
                      <span className="shrink-0 text-xs font-semibold text-slate-500">{member.email}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-navy-400"
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      if (emailSuggestions.length) {
                        event.preventDefault();
                        pickChatEmail(emailSuggestions[0].email);
                        return;
                      }
                      void sendChatMessage();
                    }
                  }}
                  placeholder="Write a message… (type @ to tag a teammate)"
                  value={chatDraft}
                />
                <button
                  className="inline-flex size-10 items-center justify-center rounded-md bg-navy-700 text-white transition hover:bg-navy-800 disabled:opacity-50"
                  disabled={chatSending || !chatDraft.trim()}
                  onClick={() => void sendChatMessage()}
                  type="button"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-5 text-navy-700" />
          <h3 className="text-base font-black text-slate-950">Quick notes / scratchpad</h3>
        </div>
        {noteStorageWarning ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            {noteStorageWarning}
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-[168px_minmax(0,1fr)]">
          <div>
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-navy-700 px-3 text-sm font-black text-white" onClick={createNote} type="button">
              <Plus className="size-4" />
              New note
            </button>
            <div className="mt-3 space-y-2">
              {state.notes.map((note) => (
                <div className={`flex items-center gap-1 rounded-xl px-2 py-1.5 ${activeNote?.id === note.id ? "bg-navy-100 text-navy-800" : "bg-slate-50 text-slate-700"}`} key={note.id}>
                  <button className="min-w-0 flex-1 truncate px-1 text-left text-sm font-black" onClick={() => setActiveNoteId(note.id)} onDoubleClick={() => renameNote(note)} title="Double click to rename" type="button">
                    {note.title}
                    {note.date ? <span className="ml-1 text-[10px] font-bold text-slate-400">{formatNoteDate(note.date)}</span> : null}
                    {noteSummary(note).open ? (
                      <span className="ml-1 text-[10px] font-bold text-slate-500">{noteSummary(note).open} open</span>
                    ) : null}
                    {noteSummary(note).nextTarget ? (
                      <span
                        className={`ml-1 text-[10px] font-black ${noteSummary(note).overdue ? "text-rose-600" : "text-emerald-700"}`}
                        title={`Next target ${formatNoteDate(noteSummary(note).nextTarget)}`}
                      >
                        ⏱ {formatNoteDate(noteSummary(note).nextTarget)}
                      </span>
                    ) : null}
                  </button>
                  <button className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-navy-700" onClick={() => renameNote(note)} title="Rename note" type="button">
                    <Pencil className="size-3.5" />
                  </button>
                  <button className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-rose-600" onClick={() => deleteNote(note.id)} title="Delete note" type="button">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-xl bg-navy-700 px-3 py-2 text-sm font-black text-white transition hover:bg-navy-800"
                onClick={() => addNoteTask()}
                type="button"
              >
                <Plus className="size-4" />
                Add task
              </button>
              <label className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">
                Date
                <input
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold outline-none focus:border-navy-400"
                  onChange={(event) => updateActiveNoteDate(event.target.value)}
                  type="date"
                  value={activeNote?.date ?? ""}
                />
              </label>
              {activeNote?.tasks.some((task) => task.done) ? (
                <button
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
                  onClick={clearDoneNoteTasks}
                  title="Remove every struck-out task from this note"
                  type="button"
                >
                  <Trash2 className="size-4" />
                  Clear done
                </button>
              ) : null}
              <span className="ml-auto text-xs font-bold text-slate-400">
                {activeNote ? `${activeNote.tasks.filter((task) => !task.done && task.text.trim()).length} open` : ""}
              </span>
            </div>

            <ul className="space-y-1.5">
              {(activeNote?.tasks ?? []).map((task, index) => {
                const overdue = isTaskOverdue(task);
                return (
                  <li
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5"
                    key={task.id}
                    style={{ backgroundColor: noteLineColorFills[task.color] ?? "transparent" }}
                  >
                    <span className="w-5 shrink-0 text-right text-[11px] font-black text-slate-400">{index + 1}.</span>

                    <input
                      aria-label="Mark task done"
                      checked={task.done}
                      className="size-4 shrink-0 accent-navy-700"
                      onChange={(event) => updateNoteTask(task.id, { done: event.target.checked })}
                      title="Tick to strike this task out"
                      type="checkbox"
                    />

                    <input
                      autoFocus={task.id === focusTaskId}
                      className={`min-w-[8rem] flex-1 border-0 bg-transparent px-1 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-slate-400 ${
                        task.done ? "text-slate-400 line-through" : "text-slate-900"
                      }`}
                      onChange={(event) => updateNoteTask(task.id, { text: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addNoteTask(task.id);
                        }
                      }}
                      placeholder="Write a task"
                      value={task.text}
                    />

                    <label
                      className={`flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${
                        overdue ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white/70 text-slate-600"
                      }`}
                      title={overdue ? "Target date has passed" : "Target date for this task"}
                    >
                      <Target className="size-3" />
                      <input
                        aria-label="Target date"
                        className="w-[7.5rem] border-0 bg-transparent text-[11px] font-bold outline-none"
                        onChange={(event) => updateNoteTask(task.id, { targetDate: event.target.value })}
                        type="date"
                        value={task.targetDate}
                      />
                    </label>

                    <select
                      aria-label="Task colour"
                      className="h-7 shrink-0 rounded-md border border-slate-200 bg-white/70 px-1 text-[11px] font-bold text-slate-600 outline-none"
                      onChange={(event) => updateNoteTask(task.id, { color: event.target.value })}
                      title="Colour this task"
                      value={task.color}
                    >
                      <option value="">No colour</option>
                      {noteLineColorSwatches.map((swatch) => (
                        <option key={swatch.key} value={swatch.key}>
                          {swatch.label}
                        </option>
                      ))}
                    </select>

                    <button
                      aria-label="Delete task"
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-rose-600"
                      onClick={() => deleteNoteTask(task.id)}
                      title="Delete this task"
                      type="button"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-navy-700 transition hover:bg-navy-50"
              onClick={() => addNoteTask()}
              type="button"
            >
              <Plus className="size-3.5" />
              Add another task
            </button>
          </div>
        </div>
      </section>

      <MonthCalendar
        events={events}
        notes={state.calendarNotes}
        onAddNote={addCalendarNote}
        onDeleteNote={deleteCalendarNote}
        onEditNote={editCalendarNote}
      />
    </div>
  );
}

/** A task still open whose target date has already passed. */
function isTaskOverdue(task: NoteTask) {
  if (task.done || !task.targetDate) {
    return false;
  }

  return task.targetDate < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Open count and nearest target date, for the note list on the left. */
function noteSummary(note: NoteFile) {
  const open = note.tasks.filter((task) => !task.done && task.text.trim());
  const targets = open.map((task) => task.targetDate).filter(Boolean).sort();

  return {
    nextTarget: targets[0] ?? "",
    open: open.length,
    overdue: open.some(isTaskOverdue)
  };
}

function formatNoteDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return value;
}

function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}
