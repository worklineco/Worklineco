"use client";

import { getCurrentUser } from "@/lib/supabase/session";
import { CalendarClock, NotebookPen, Plus, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type NoteFile = { content: string; id: string; title: string; updatedAt: string };
type FollowUp = { dueDate: string; id: string; item: string; owner: string; status: "Open" | "Done"; type: string };
type Meeting = { agenda: string; id: string; prepNotes: string; time: string; title: string };
type DashboardState = { followUps: FollowUp[]; meetings: Meeting[]; notes: NoteFile[] };

const storageKey = "workline-partner-dashboard";
const today = new Date().toISOString().slice(0, 10);
const defaultState: DashboardState = {
  followUps: [
    { dueDate: today, id: "followup-1", item: "Send pending update promised to client", owner: "Partner", status: "Open", type: "Email" }
  ],
  meetings: [
    { agenda: "Review urgent matters, open filings, and delegation points.", id: "meeting-1", prepNotes: "Carry forward agenda notes here before the meeting.", time: "10:30", title: "Daily partner review" }
  ],
  notes: [
    { content: "1. ", id: "note-1", title: "Daily Scratchpad", updatedAt: new Date().toISOString() }
  ]
};

export function PartnerDashboard() {
  const [profileName, setProfileName] = useState("Partner");
  const [profileEmail, setProfileEmail] = useState("");
  const [state, setState] = useState<DashboardState>(defaultState);
  const [activeNoteId, setActiveNoteId] = useState(defaultState.notes[0]?.id ?? "");
  const [useNumberedNotes, setUseNumberedNotes] = useState(true);
  const [followUpDraft, setFollowUpDraft] = useState({ dueDate: "", item: "", owner: "", type: "Callback" });
  const [meetingDraft, setMeetingDraft] = useState({ agenda: "", prepNotes: "", time: "", title: "" });

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<DashboardState>;
      setState({
        followUps: parsed.followUps ?? defaultState.followUps,
        meetings: parsed.meetings ?? defaultState.meetings,
        notes: parsed.notes?.length ? parsed.notes : defaultState.notes
      });
      setActiveNoteId(parsed.notes?.[0]?.id ?? defaultState.notes[0]?.id ?? "");
    }

    getCurrentUser().then((user) => {
      const metadata = user?.user_metadata ?? {};
      setProfileName(String(metadata.full_name ?? metadata.name ?? user?.email ?? "Partner").trim() || "Partner");
      setProfileEmail(user?.email ?? "");
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const firstName = useMemo(() => profileName.split(" ")[0] || "Partner", [profileName]);
  const activeNote = state.notes.find((note) => note.id === activeNoteId) ?? state.notes[0];
  const openFollowUps = state.followUps.filter((followUp) => followUp.status === "Open").length;

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

  function addFollowUp() {
    if (!followUpDraft.item.trim()) {
      return;
    }
    setState((current) => ({
      ...current,
      followUps: [
        { dueDate: followUpDraft.dueDate, id: crypto.randomUUID(), item: followUpDraft.item.trim(), owner: followUpDraft.owner.trim() || profileName, status: "Open", type: followUpDraft.type },
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
    <div className="mt-4 grid gap-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-950">{firstName}&rsquo;s Dashboard</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{profileEmail || profileName}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Open Follow-ups" value={String(openFollowUps)} />
            <Metric label="Notes" value={String(state.notes.length)} />
            <Metric label="Meetings" value={String(state.meetings.length)} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-5 text-navy-700" />
          <h3 className="text-base font-black text-slate-950">Quick notes / scratchpad</h3>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
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
                  </button>
                  <button className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-rose-600" onClick={() => deleteNote(note.id)} title="Delete note" type="button">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-3 inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">
              <input checked={useNumberedNotes} onChange={(event) => toggleNumberedNotes(event.target.checked)} type="checkbox" />
              Numbered bullets
            </label>
            <textarea
              className="min-h-[14rem] w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 outline-none focus:border-navy-400 focus:bg-white"
              onChange={(event) => updateActiveNote(useNumberedNotes ? numberNoteLines(event.target.value) : event.target.value)}
              placeholder="Write notes here"
              value={activeNote?.content ?? ""}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound className="size-5 text-navy-700" />
            <h3 className="text-base font-black text-slate-950">Follow-ups &amp; reminders</h3>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_130px_130px_auto]">
            <input className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-navy-400" onChange={(event) => setFollowUpDraft((current) => ({ ...current, item: event.target.value }))} placeholder="Callback, email, promise made" value={followUpDraft.item} />
            <input className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-navy-400" onChange={(event) => setFollowUpDraft((current) => ({ ...current, dueDate: event.target.value }))} type="date" value={followUpDraft.dueDate} />
            <select className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-navy-400" onChange={(event) => setFollowUpDraft((current) => ({ ...current, type: event.target.value }))} value={followUpDraft.type}>
              <option>Callback</option>
              <option>Email</option>
              <option>Client promise</option>
              <option>Team promise</option>
            </select>
            <button className="flex size-10 items-center justify-center rounded-xl bg-navy-700 text-white" onClick={addFollowUp} type="button">
              <Plus className="size-4" />
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {state.followUps.map((followUp) => (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3" key={followUp.id}>
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

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-navy-700" />
            <h3 className="text-base font-black text-slate-950">Meetings &amp; appointments today</h3>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[120px_1fr_auto]">
            <input className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-navy-400" onChange={(event) => setMeetingDraft((current) => ({ ...current, time: event.target.value }))} type="time" value={meetingDraft.time} />
            <input className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-navy-400" onChange={(event) => setMeetingDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Meeting title" value={meetingDraft.title} />
            <button className="flex size-10 items-center justify-center rounded-xl bg-navy-700 text-white" onClick={addMeeting} type="button">
              <Plus className="size-4" />
            </button>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <textarea className="min-h-20 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold outline-none focus:border-navy-400" onChange={(event) => setMeetingDraft((current) => ({ ...current, prepNotes: event.target.value }))} placeholder="Linked prep notes" value={meetingDraft.prepNotes} />
            <textarea className="min-h-20 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold outline-none focus:border-navy-400" onChange={(event) => setMeetingDraft((current) => ({ ...current, agenda: event.target.value }))} placeholder="Agenda" value={meetingDraft.agenda} />
          </div>
          <div className="mt-4 space-y-2">
            {state.meetings.map((meeting) => (
              <div className="rounded-xl bg-slate-50 p-3" key={meeting.id}>
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
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}
