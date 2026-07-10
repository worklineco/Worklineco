"use client";

import { supabase } from "@/lib/supabase/client";
import {
  CalendarClock,
  CheckCircle2,
  FileText,
  MessageSquareText,
  NotebookPen,
  Plus,
  Send,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Priority = "High" | "Medium" | "Low";
type TaskCategory = "Technical" | "Business Development" | "Hiring and Resource Management";
type TaskItem = {
  category: TaskCategory;
  done: boolean;
  dueDate: string;
  id: string;
  priority: Priority;
  title: string;
};
type NoteFile = {
  content: string;
  id: string;
  title: string;
  updatedAt: string;
};
type ThreadMessage = {
  author: string;
  body: string;
  createdAt: string;
  id: string;
};
type ThreadItem = {
  id: string;
  members: string;
  messages: ThreadMessage[];
  title: string;
};
type FollowUp = {
  dueDate: string;
  id: string;
  item: string;
  owner: string;
  status: "Open" | "Done";
  type: string;
};
type Meeting = {
  agenda: string;
  id: string;
  prepNotes: string;
  time: string;
  title: string;
};
type DashboardState = {
  followUps: FollowUp[];
  meetings: Meeting[];
  notes: NoteFile[];
  tasks: TaskItem[];
  threads: ThreadItem[];
};

const taskCategories: TaskCategory[] = ["Technical", "Business Development", "Hiring and Resource Management"];
const storageKey = "workline-partner-dashboard";
const today = new Date().toISOString().slice(0, 10);
const defaultState: DashboardState = {
  followUps: [
    {
      dueDate: today,
      id: "followup-1",
      item: "Send pending update promised to client",
      owner: "Partner",
      status: "Open",
      type: "Email"
    }
  ],
  meetings: [
    {
      agenda: "Review urgent matters, open filings, and delegation points.",
      id: "meeting-1",
      prepNotes: "Carry forward agenda notes here before the meeting.",
      time: "10:30",
      title: "Daily partner review"
    }
  ],
  notes: [
    {
      content: "Use this scratchpad for quick working notes, client calls, and ideas.",
      id: "note-1",
      title: "Daily Scratchpad",
      updatedAt: new Date().toISOString()
    }
  ],
  tasks: [
    {
      category: "Technical",
      done: false,
      dueDate: today,
      id: "task-1",
      priority: "High",
      title: "Review high-priority technical issue"
    }
  ],
  threads: [
    {
      id: "thread-1",
      members: "Shuchi Sethi, Team 03",
      messages: [
        {
          author: "WorkLine",
          body: "Start a thread by adding members and posting the first message.",
          createdAt: new Date().toISOString(),
          id: "message-1"
        }
      ],
      title: "Partner coordination"
    }
  ]
};

export function PartnerDashboard() {
  const [profileName, setProfileName] = useState("Partner");
  const [profileEmail, setProfileEmail] = useState("");
  const [state, setState] = useState<DashboardState>(defaultState);
  const [activeNoteId, setActiveNoteId] = useState(defaultState.notes[0]?.id ?? "");
  const [activeThreadId, setActiveThreadId] = useState(defaultState.threads[0]?.id ?? "");
  const [activeTaskDates, setActiveTaskDates] = useState<Record<TaskCategory, string>>({
    "Business Development": today,
    "Hiring and Resource Management": today,
    Technical: today
  });
  const [taskDrafts, setTaskDrafts] = useState<Record<TaskCategory, { priority: Priority; title: string }>>({
    "Business Development": { priority: "Medium", title: "" },
    "Hiring and Resource Management": { priority: "Medium", title: "" },
    Technical: { priority: "High", title: "" }
  });
  const [useNumberedNotes, setUseNumberedNotes] = useState(false);
  const [threadDraft, setThreadDraft] = useState({ members: "", title: "" });
  const [messageDraft, setMessageDraft] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState({ dueDate: "", item: "", owner: "", type: "Callback" });
  const [meetingDraft, setMeetingDraft] = useState({ agenda: "", prepNotes: "", time: "", title: "" });

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);

    if (saved) {
      const parsed = JSON.parse(saved) as DashboardState;
      setState(parsed);
      setActiveNoteId(parsed.notes[0]?.id ?? "");
      setActiveThreadId(parsed.threads[0]?.id ?? "");
    }

    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const metadata = user?.user_metadata ?? {};
      const name = String(metadata.full_name ?? metadata.name ?? user?.email ?? "Partner").trim();
      setProfileName(name || "Partner");
      setProfileEmail(user?.email ?? "");
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const firstName = useMemo(() => profileName.split(" ")[0] || "Partner", [profileName]);
  const activeNote = state.notes.find((note) => note.id === activeNoteId) ?? state.notes[0];
  const activeThread = state.threads.find((thread) => thread.id === activeThreadId) ?? state.threads[0];

  function addTask(category: TaskCategory) {
    const draft = taskDrafts[category];

    if (!draft.title.trim()) {
      return;
    }

    setState((current) => ({
      ...current,
      tasks: [
        {
          category,
          done: false,
          dueDate: activeTaskDates[category],
          id: crypto.randomUUID(),
          priority: draft.priority,
          title: draft.title.trim()
        },
        ...current.tasks
      ]
    }));
    setTaskDrafts((current) => ({ ...current, [category]: { priority: "Medium", title: "" } }));
  }

  function updateTask(id: string, updates: Partial<TaskItem>) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === id ? { ...task, ...updates } : task))
    }));
  }

  function createNote() {
    const nextNumber = state.notes.length + 1;
    const note = {
      content: useNumberedNotes ? "1. " : "",
      id: crypto.randomUUID(),
      title: `Note ${nextNumber}`,
      updatedAt: new Date().toISOString()
    };
    setState((current) => ({ ...current, notes: [note, ...current.notes] }));
    setActiveNoteId(note.id);
  }

  function updateActiveNote(content: string) {
    if (!activeNote) {
      return;
    }

    setState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === activeNote.id ? { ...note, content, updatedAt: new Date().toISOString() } : note
      )
    }));
  }

  function numberNoteLines(content: string) {
    let count = 0;

    return content
      .split("\n")
      .map((line) => {
        const cleaned = line.replace(/^\s*\d+\.\s*/, "").trim();

        if (!cleaned) {
          return "";
        }

        count += 1;
        return `${count}. ${cleaned}`;
      })
      .join("\n");
  }

  function toggleNumberedNotes(checked: boolean) {
    setUseNumberedNotes(checked);

    if (checked && activeNote) {
      updateActiveNote(activeNote.content.trim() ? numberNoteLines(activeNote.content) : "1. ");
    }
  }

  function createThread() {
    if (!threadDraft.title.trim() || !threadDraft.members.trim()) {
      return;
    }

    const thread = {
      id: crypto.randomUUID(),
      members: threadDraft.members.trim(),
      messages: [],
      title: threadDraft.title.trim()
    };
    setState((current) => ({ ...current, threads: [thread, ...current.threads] }));
    setActiveThreadId(thread.id);
    setThreadDraft({ members: "", title: "" });
  }

  function sendMessage() {
    if (!activeThread || !messageDraft.trim()) {
      return;
    }

    const message = {
      author: profileName,
      body: messageDraft.trim(),
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID()
    };

    setState((current) => ({
      ...current,
      threads: current.threads.map((thread) =>
        thread.id === activeThread.id ? { ...thread, messages: [...thread.messages, message] } : thread
      )
    }));
    setMessageDraft("");
  }

  function addFollowUp() {
    if (!followUpDraft.item.trim()) {
      return;
    }

    setState((current) => ({
      ...current,
      followUps: [
        {
          dueDate: followUpDraft.dueDate,
          id: crypto.randomUUID(),
          item: followUpDraft.item.trim(),
          owner: followUpDraft.owner.trim() || profileName,
          status: "Open",
          type: followUpDraft.type
        },
        ...current.followUps
      ]
    }));
    setFollowUpDraft({ dueDate: "", item: "", owner: "", type: "Callback" });
  }

  function updateFollowUp(id: string, status: FollowUp["status"]) {
    setState((current) => ({
      ...current,
      followUps: current.followUps.map((followUp) => (followUp.id === id ? { ...followUp, status } : followUp))
    }));
  }

  function addMeeting() {
    if (!meetingDraft.title.trim()) {
      return;
    }

    setState((current) => ({
      ...current,
      meetings: [{ ...meetingDraft, id: crypto.randomUUID(), title: meetingDraft.title.trim() }, ...current.meetings]
    }));
    setMeetingDraft({ agenda: "", prepNotes: "", time: "", title: "" });
  }

  return (
    <div className="mt-5 grid gap-5">
      <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-violet-700">Logged in partner</p>
            <h2 className="mt-1 text-3xl font-black text-slate-950">{firstName}'s Dashboard</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">{profileEmail || profileName}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Open Tasks" value={String(state.tasks.filter((task) => !task.done).length)} />
            <Metric label="Notes" value={String(state.notes.length)} />
            <Metric label="Threads" value={String(state.threads.length)} />
            <Metric label="Today" value={String(state.meetings.length)} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {taskCategories.map((category) => (
          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]" key={category}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-violet-700" />
              <h3 className="text-base font-black text-slate-950">To-do list ({category})</h3>
            </div>

            <div className="mt-4 rounded-2xl bg-violet-50 p-3">
              <label className="block">
                <span className="text-xs font-black uppercase text-violet-700">Date</span>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-violet-100 bg-white px-3 text-sm font-black text-slate-950 outline-none focus:border-violet-500"
                  onChange={(event) =>
                    setActiveTaskDates((current) => ({ ...current, [category]: event.target.value }))
                  }
                  type="date"
                  value={activeTaskDates[category]}
                />
              </label>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <input
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-violet-500"
                  onChange={(event) =>
                    setTaskDrafts((current) => ({ ...current, [category]: { ...current[category], title: event.target.value } }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      addTask(category);
                    }
                  }}
                  placeholder="Write task and press Enter"
                  value={taskDrafts[category].title}
                />
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  {(["High", "Medium", "Low"] as Priority[]).map((priority) => (
                    <button
                      aria-label={`${priority} priority`}
                      className={`size-4 rounded-full ring-2 ring-offset-2 transition ${priorityDotClass(priority)} ${
                        taskDrafts[category].priority === priority ? "ring-slate-950" : "ring-transparent"
                      }`}
                      key={priority}
                      onClick={() =>
                        setTaskDrafts((current) => ({
                          ...current,
                          [category]: { ...current[category], priority }
                        }))
                      }
                      title={`${priority} priority`}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {state.tasks.filter((task) => task.category === category && task.dueDate === activeTaskDates[category]).map((task, index) => (
                <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3" key={task.id}>
                  <input checked={task.done} className="mt-1" onChange={(event) => updateTask(task.id, { done: event.target.checked })} type="checkbox" />
                  <span className="text-sm font-black text-slate-400">{index + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-black ${task.done ? "text-slate-400 line-through" : "text-slate-950"}`}>{task.title}</span>
                  </span>
                  <span className={`size-3.5 shrink-0 rounded-full ${priorityDotClass(task.priority)}`} title={`${task.priority} priority`} />
                </label>
              ))}
              {state.tasks.filter((task) => task.category === category && task.dueDate === activeTaskDates[category]).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                  No tasks added for this date.
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
        <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2">
            <NotebookPen className="size-5 text-violet-700" />
            <h3 className="text-base font-black text-slate-950">Quick notes / scratchpad</h3>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div>
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-black text-white" onClick={createNote} type="button">
                <Plus className="size-4" />
                New note
              </button>
              <div className="mt-3 space-y-2">
                {state.notes.map((note) => (
                  <button className={`w-full rounded-xl px-3 py-2 text-left text-sm font-black ${activeNote?.id === note.id ? "bg-violet-100 text-violet-900" : "bg-slate-50 text-slate-700"}`} key={note.id} onClick={() => setActiveNoteId(note.id)} type="button">
                    {note.title}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-3 inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">
                <input
                  checked={useNumberedNotes}
                  onChange={(event) => toggleNumberedNotes(event.target.checked)}
                  type="checkbox"
                />
                Numbered bullets
              </label>
              <textarea
                className="min-h-72 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 outline-none focus:border-violet-500 focus:bg-white"
                onChange={(event) => updateActiveNote(useNumberedNotes ? numberNoteLines(event.target.value) : event.target.value)}
                placeholder="Write notes here"
                value={activeNote?.content ?? ""}
              />
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-5 text-violet-700" />
            <h3 className="text-base font-black text-slate-950">Threads</h3>
          </div>
          <div className="mt-4 grid gap-2">
            <input className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-violet-500" onChange={(event) => setThreadDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Thread title" value={threadDraft.title} />
            <div className="flex gap-2">
              <input className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-violet-500" onChange={(event) => setThreadDraft((current) => ({ ...current, members: event.target.value }))} placeholder="Members or group" value={threadDraft.members} />
              <button className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white" onClick={createThread} type="button">
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-2">
              {state.threads.map((thread) => (
                <button className={`w-full rounded-xl px-3 py-2 text-left text-sm font-black ${activeThread?.id === thread.id ? "bg-violet-100 text-violet-900" : "bg-slate-50 text-slate-700"}`} key={thread.id} onClick={() => setActiveThreadId(thread.id)} type="button">
                  {thread.title}
                </button>
              ))}
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">{activeThread?.members ?? "No members"}</p>
              <div className="mt-3 max-h-72 space-y-2 overflow-auto">
                {activeThread?.messages.map((message) => (
                  <div className="rounded-xl bg-white p-3 text-sm shadow-sm" key={message.id}>
                    <p className="font-black text-slate-950">{message.author}</p>
                    <p className="mt-1 font-semibold leading-5 text-slate-600">{message.body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-violet-500" onChange={(event) => setMessageDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendMessage()} placeholder="Write a message" value={messageDraft} />
                <button className="flex size-10 items-center justify-center rounded-xl bg-violet-700 text-white" onClick={sendMessage} type="button">
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2">
            <UserRound className="size-5 text-violet-700" />
            <h3 className="text-base font-black text-slate-950">Follow-ups & reminders</h3>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_130px_130px_auto]">
            <input className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-violet-500" onChange={(event) => setFollowUpDraft((current) => ({ ...current, item: event.target.value }))} placeholder="Callback, email, promise made" value={followUpDraft.item} />
            <input className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-violet-500" onChange={(event) => setFollowUpDraft((current) => ({ ...current, dueDate: event.target.value }))} type="date" value={followUpDraft.dueDate} />
            <select className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-violet-500" onChange={(event) => setFollowUpDraft((current) => ({ ...current, type: event.target.value }))} value={followUpDraft.type}>
              <option>Callback</option>
              <option>Email</option>
              <option>Client promise</option>
              <option>Team promise</option>
            </select>
            <button className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white" onClick={addFollowUp} type="button">
              <Plus className="size-4" />
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {state.followUps.map((followUp) => (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-3" key={followUp.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-950">{followUp.item}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{followUp.type} {followUp.dueDate ? `| ${followUp.dueDate}` : ""}</p>
                </div>
                <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black outline-none" onChange={(event) => updateFollowUp(followUp.id, event.target.value as FollowUp["status"])} value={followUp.status}>
                  <option>Open</option>
                  <option>Done</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-violet-700" />
            <h3 className="text-base font-black text-slate-950">Meetings & appointments today</h3>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[120px_1fr_auto]">
            <input className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-violet-500" onChange={(event) => setMeetingDraft((current) => ({ ...current, time: event.target.value }))} type="time" value={meetingDraft.time} />
            <input className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-violet-500" onChange={(event) => setMeetingDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Meeting title" value={meetingDraft.title} />
            <button className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white" onClick={addMeeting} type="button">
              <Plus className="size-4" />
            </button>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <textarea className="min-h-20 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold outline-none focus:border-violet-500" onChange={(event) => setMeetingDraft((current) => ({ ...current, prepNotes: event.target.value }))} placeholder="Linked prep notes" value={meetingDraft.prepNotes} />
            <textarea className="min-h-20 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold outline-none focus:border-violet-500" onChange={(event) => setMeetingDraft((current) => ({ ...current, agenda: event.target.value }))} placeholder="Agenda" value={meetingDraft.agenda} />
          </div>
          <div className="mt-4 space-y-2">
            {state.meetings.map((meeting) => (
              <div className="rounded-2xl bg-slate-50 p-3" key={meeting.id}>
                <p className="text-sm font-black text-slate-950">{meeting.time ? `${meeting.time} | ` : ""}{meeting.title}</p>
                <p className="mt-2 text-xs font-black uppercase text-slate-500">Prep notes</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{meeting.prepNotes || "-"}</p>
                <p className="mt-2 text-xs font-black uppercase text-slate-500">Agenda</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{meeting.agenda || "-"}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function priorityDotClass(priority: Priority) {
  if (priority === "High") {
    return "bg-rose-500";
  }

  if (priority === "Medium") {
    return "bg-amber-400";
  }

  return "bg-emerald-500";
}
