"use client";

import { MessagesSquare, Search, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCached, setCached } from "@/lib/data-cache";

type TaskLineRow = Record<string, string>;
type BillingRecord = Record<string, unknown>;
type ELRow = Record<string, string | number>;

export function TaskHub() {
  const [rows, setRows] = useState<TaskLineRow[]>([]);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [elRows, setElRows] = useState<ELRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [thread, setThread] = useState<{ code: string; team: string } | null>(null);
  const [messages, setMessages] = useState<{ author_name?: string; body: string; created_at: string; id: string }[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;

    const cached = getCached<TaskLineRow[]>("taskhub:tasks");
    if (cached) {
      setRows(cached);
      setIsLoading(false);
    }

    Promise.all([
      fetch("/api/taskline", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { rows: [] })).catch(() => ({ rows: [] })),
      fetch("/api/billing", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { records: [] })).catch(() => ({ records: [] })),
      fetch("/api/engagement-letters/managed", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { rows: [] })).catch(() => ({ rows: [] }))
    ]).then(([task, bill, el]) => {
      if (!active) {
        return;
      }
      const taskRows = Array.isArray(task?.rows) ? (task.rows as TaskLineRow[]) : [];
      setRows(taskRows);
      setCached("taskhub:tasks", taskRows);
      setBilling(Array.isArray(bill?.records) ? (bill.records as BillingRecord[]) : []);
      setElRows(Array.isArray(el?.rows) ? (el.rows as ELRow[]) : []);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const billingByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of billing) {
      const code = String((record as { task_code?: unknown }).task_code ?? "").trim();
      if (code) {
        map.set(code, String((record as { billing_status?: unknown }).billing_status ?? ""));
      }
    }
    return map;
  }, [billing]);

  const elByCode = useMemo(() => {
    const map = new Map<string, { no: string; status: string }>();
    for (const row of elRows) {
      const code = String(row["Task Code"] ?? "").trim();
      if (code) {
        map.set(code, {
          no: String(row["EL No."] ?? row["Client / Entity"] ?? "").trim(),
          status: String(row["Billed Status"] ?? "").trim()
        });
      }
    }
    return map;
  }, [elRows]);

  const codedTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => String(row.task_code ?? "").trim())
      .filter(
        (row) =>
          !query ||
          ["task_code", "team", "entity", "entity_group", "task", "stage", "status_open_close"].some((key) =>
            String(row[key] ?? "").toLowerCase().includes(query)
          )
      );
  }, [rows, search]);

  async function openThread(code: string, team: string) {
    setThread({ code, team });
    setMessages([]);
    setMessageDraft("");
    setThreadLoading(true);
    try {
      const response = await fetch(`/api/task-messages?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const result = await response.json();
      setMessages(Array.isArray(result?.messages) ? result.messages : []);
    } catch {
      // ignore
    } finally {
      setThreadLoading(false);
    }
  }

  async function sendMessage() {
    if (!thread || !messageDraft.trim()) {
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/task-messages", {
        body: JSON.stringify({ body: messageDraft.trim(), code: thread.code, team: thread.team }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      if (response.ok) {
        setMessageDraft("");
        const refreshed = await fetch(`/api/task-messages?code=${encodeURIComponent(thread.code)}`, { cache: "no-store" });
        const result = await refreshed.json();
        setMessages(Array.isArray(result?.messages) ? result.messages : []);
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="shrink-0">
          <h2 className="text-xl font-black text-slate-950">Task Hub</h2>
          <p className="text-xs font-bold text-slate-500">
            {isLoading ? "Loading..." : `${codedTasks.length} coded tasks`}
          </p>
        </div>
        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search className="size-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code, team, entity, task, stage"
            value={search}
          />
        </label>
      </div>

      <div className="mt-4 max-h-[calc(100vh-200px)] overflow-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
            <tr>
              <th className="px-3 py-2">Task Code</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Work Status</th>
              <th className="px-3 py-2">Open/Close</th>
              <th className="px-3 py-2">EL No.</th>
              <th className="px-3 py-2">Billing</th>
              <th className="px-3 py-2">Chat</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={9}>Loading...</td></tr>
            ) : codedTasks.length ? codedTasks.map((row) => {
              const code = String(row.task_code ?? "").trim();
              const el = elByCode.get(code);
              const billingStatus = billingByCode.get(code);
              const openClose = String(row.status_open_close ?? "").trim();
              return (
                <tr className="border-b border-slate-100 last:border-b-0" key={row.__id || code}>
                  <td className="px-3 py-2 font-black text-navy-700">{code}</td>
                  <td className="px-3 py-2 font-semibold text-slate-600">{row.team || "—"}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.entity || row.entity_group || "—"}</td>
                  <td className="px-3 py-2 font-semibold text-slate-700">{row.task || "—"}</td>
                  <td className="px-3 py-2 font-semibold text-slate-700">{row.stage || "—"}</td>
                  <td className="px-3 py-2">
                    {openClose ? (
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${openClose.toLowerCase().startsWith("close") ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {openClose}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {el ? (
                      <span className="font-bold text-slate-800">{el.no || "Generated"}{el.status ? ` · ${el.status}` : ""}</span>
                    ) : <span className="text-xs font-bold text-slate-400">Not generated</span>}
                  </td>
                  <td className="px-3 py-2">
                    {billingStatus ? (
                      <span className="font-bold text-slate-800">{billingStatus}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <button className="inline-flex size-8 items-center justify-center rounded-md border border-navy-200 text-navy-700 transition hover:bg-navy-50" onClick={() => openThread(code, String(row.team ?? ""))} title="Open task chat" type="button">
                      <MessagesSquare className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            }) : (
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={9}>No coded tasks yet. New tasks added in TaskLine will appear here with their Task Code.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {thread ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4 py-6" onClick={() => setThread(null)}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-navy-700">Task chat</p>
                <h3 className="mt-0.5 text-lg font-black text-slate-950">{thread.code}</h3>
              </div>
              <button className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setThread(null)} type="button">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {threadLoading ? (
                <p className="text-sm font-bold text-slate-500">Loading...</p>
              ) : messages.length ? (
                messages.map((message) => (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" key={message.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-navy-700">{message.author_name || "User"}</p>
                      <p className="text-[10px] font-bold text-slate-400">{formatMessageTime(message.created_at)}</p>
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">{message.body}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm font-semibold text-slate-400">No messages yet. Start the conversation.</p>
              )}
            </div>
            <div className="flex gap-2 border-t border-slate-200 px-4 py-3">
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-navy-400"
                onChange={(event) => setMessageDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && sendMessage()}
                placeholder="Write a message"
                value={messageDraft}
              />
              <button
                className="inline-flex size-10 items-center justify-center rounded-md bg-navy-700 text-white transition hover:bg-navy-800 disabled:opacity-50"
                disabled={sending || !messageDraft.trim()}
                onClick={sendMessage}
                type="button"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}
