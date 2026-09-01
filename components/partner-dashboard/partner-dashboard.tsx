"use client";

import { getCurrentUser } from "@/lib/supabase/session";
import { MessagesSquare, NotebookPen, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { MonthCalendar, type CalendarEvent } from "@/components/home/month-calendar";
import { TaskNotificationBell } from "@/components/home/task-notification-bell";
import { getCached, setCached } from "@/lib/data-cache";
import { useEffect, useRef, useState } from "react";

type NoteFile = { content: string; date?: string; id: string; lineColors?: string[]; title: string; updatedAt: string };
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
  notes: [{ content: "1. ", id: "note-1", title: "Daily Scratchpad", updatedAt: new Date().toISOString() }]
};

export function PartnerDashboard() {
  const [profileName, setProfileName] = useState("Partner");
  const [profileEmail, setProfileEmail] = useState("");
  const [state, setState] = useState<DashboardState>(defaultState);
  const [activeNoteId, setActiveNoteId] = useState(defaultState.notes[0]?.id ?? "");
  const [useNumberedNotes, setUseNumberedNotes] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [chats, setChats] = useState<Thread[]>([]);
  const [chatReads, setChatReads] = useState<Record<string, number>>({});
  const [chatHidden, setChatHidden] = useState<Record<string, number>>({});
  const [openChat, setOpenChat] = useState<{ code: string; count: number; entity: string; label: string; loading: boolean; messages: ChatMessage[]; task: string; team: string } | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [teamEmails, setTeamEmails] = useState<{ email: string; name: string }[]>([]);
  const noteEditorRef = useRef<HTMLTextAreaElement>(null);
  const noteOverlayRef = useRef<HTMLDivElement>(null);
  const [activeNoteLine, setActiveNoteLine] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<DashboardState>;
      setState({
        calendarNotes: parsed.calendarNotes ?? {},
        notes: parsed.notes?.length ? parsed.notes : defaultState.notes
      });
      setActiveNoteId(parsed.notes?.[0]?.id ?? defaultState.notes[0]?.id ?? "");
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

    void loadChats();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
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
    const note = { content: useNumberedNotes ? "1. " : "", id: crypto.randomUUID(), title: `Note ${state.notes.length + 1}`, updatedAt: new Date().toISOString() };
    setState((current) => ({ ...current, notes: [note, ...current.notes] }));
    setActiveNoteId(note.id);
  }

  function updateActiveNote(content: string) {
    if (!activeNote) {
      return;
    }
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => (note.id === activeNote.id ? { ...note, content, updatedAt: new Date().toISOString() } : note))
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
      return { ...current, notes: notes.length ? notes : [{ content: "", id: crypto.randomUUID(), title: "Note 1", updatedAt: new Date().toISOString() }] };
    });
    setActiveNoteId((current) => {
      const remaining = state.notes.filter((note) => note.id !== id);
      return current === id ? remaining[0]?.id ?? "" : current;
    });
  }

  function numberNoteLines(content: string) {
    let count = 0;
    return content
      .split("\n")
      .map((line) => {
        // Strip only an existing "N. " prefix; keep the rest of the line exactly
        // as typed (including spaces) so the spacebar and blank lines work.
        const rest = line.replace(/^\s*\d+\.\s?/, "");
        if (rest.trim() === "") {
          return rest;
        }
        count += 1;
        return `${count}. ${rest}`;
      })
      .join("\n");
  }

  function currentNoteLineIndex() {
    const el = noteEditorRef.current;
    if (!el) {
      return 0;
    }
    const caret = el.selectionStart ?? 0;
    return (activeNote?.content ?? "").slice(0, caret).split("\n").length - 1;
  }

  function syncNoteScroll() {
    const overlay = noteOverlayRef.current;
    const editor = noteEditorRef.current;
    if (overlay && editor) {
      overlay.scrollTop = editor.scrollTop;
      overlay.scrollLeft = editor.scrollLeft;
    }
  }

  function setActiveNoteLineColor(color: string) {
    if (!activeNote) {
      return;
    }
    const index = currentNoteLineIndex();
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => {
        if (note.id !== activeNote.id) {
          return note;
        }
        const colors = [...(note.lineColors ?? [])];
        while (colors.length <= index) {
          colors.push("");
        }
        colors[index] = color;
        return { ...note, lineColors: colors, updatedAt: new Date().toISOString() };
      })
    }));
    noteEditorRef.current?.focus();
  }

  function toggleNumberedNotes(checked: boolean) {
    setUseNumberedNotes(checked);
    if (checked && activeNote) {
      updateActiveNote(activeNote.content.trim() ? numberNoteLines(activeNote.content) : "1. ");
    }
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
              <label className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">
                <input checked={useNumberedNotes} onChange={(event) => toggleNumberedNotes(event.target.checked)} type="checkbox" />
                Numbered bullets
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">
                Date
                <input
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold outline-none focus:border-navy-400"
                  onChange={(event) => updateActiveNoteDate(event.target.value)}
                  type="date"
                  value={activeNote?.date ?? ""}
                />
              </label>
              <span className="ml-2 text-xs font-black uppercase tracking-wide text-slate-400">Colour line</span>
              {noteLineColorSwatches.map((swatch) => (
                <button
                  className="size-6 rounded-full border-2 transition hover:scale-110"
                  key={swatch.key}
                  onClick={() => setActiveNoteLineColor(swatch.key)}
                  style={{ backgroundColor: noteLineColorFills[swatch.key], borderColor: swatch.ring }}
                  title={`Colour this line ${swatch.label}`}
                  type="button"
                />
              ))}
              <button
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
                onClick={() => setActiveNoteLineColor("")}
                title="Remove colour from this line"
                type="button"
              >
                Clear
              </button>
            </div>
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-2xl border border-transparent p-4 text-sm font-semibold leading-6 text-transparent"
                ref={noteOverlayRef}
              >
                {(activeNote?.content ?? "").split("\n").map((line, index) => (
                  <div
                    key={index}
                    style={{
                      backgroundColor: noteLineColorFills[activeNote?.lineColors?.[index] ?? ""] ?? "transparent",
                      borderRadius: 4,
                      boxShadow: index === activeNoteLine ? "inset 0 0 0 1.5px #cbd5e1" : undefined
                    }}
                  >
                    {line === "" ? "​" : line}
                  </div>
                ))}
              </div>
              <textarea
                className="relative z-10 min-h-[14rem] w-full resize-y whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-transparent p-4 text-sm font-semibold leading-6 outline-none focus:border-navy-400"
                onChange={(event) => updateActiveNote(useNumberedNotes ? numberNoteLines(event.target.value) : event.target.value)}
                onClick={() => setActiveNoteLine(currentNoteLineIndex())}
                onKeyUp={() => setActiveNoteLine(currentNoteLineIndex())}
                onScroll={syncNoteScroll}
                onSelect={() => setActiveNoteLine(currentNoteLineIndex())}
                placeholder="Write notes here"
                ref={noteEditorRef}
                value={activeNote?.content ?? ""}
              />
            </div>
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
