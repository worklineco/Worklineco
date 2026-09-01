"use client";

import { ArrowDown, ArrowLeft, ArrowUp, Filter, MessagesSquare, Search, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCached, setCached } from "@/lib/data-cache";

type TaskLineRow = Record<string, string>;
type BillingRecord = Record<string, unknown>;
type ELRow = Record<string, string | number>;
type TaskHubColumnKey = "task_code" | "team" | "entity" | "task" | "stage" | "status_open_close" | "el" | "billable" | "billing";
type TaskHubSort = { dir: "asc" | "desc"; key: TaskHubColumnKey } | null;

const taskHubColumns: { key: TaskHubColumnKey; label: string; width: number }[] = [
  { key: "task_code", label: "Task Code", width: 120 },
  { key: "team", label: "Team", width: 110 },
  { key: "entity", label: "Entity", width: 210 },
  { key: "task", label: "Task", width: 190 },
  { key: "stage", label: "Work Status", width: 140 },
  { key: "status_open_close", label: "Open/Close", width: 130 },
  { key: "el", label: "EL No.", width: 180 },
  { key: "billable", label: "Billable", width: 110 },
  { key: "billing", label: "Billing", width: 150 }
];

export function TaskHub() {
  const [rows, setRows] = useState<TaskLineRow[]>([]);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [elRows, setElRows] = useState<ELRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<TaskHubColumnKey, string>>>({});
  const [sortState, setSortState] = useState<TaskHubSort>(null);
  const [thread, setThread] = useState<{ code: string; team: string } | null>(null);
  const [messages, setMessages] = useState<{ author_name?: string; body: string; created_at: string; id: string }[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState("");

  useEffect(() => {
    let active = true;

    const cached = getCached<TaskLineRow[]>("taskhub:tasks");
    if (cached) {
      setRows(cached);
      setIsLoading(false);
    } else {
      const shared = getCached<{ rows?: TaskLineRow[] }>("taskline:rows:v4");
      if (shared?.rows?.length) {
        setRows(shared.rows);
        setIsLoading(false);
      }
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
    const query = search.trim().toLocaleLowerCase();
    const filtered = rows
      .filter((row) => String(row.task_code ?? "").trim())
      .filter((row) => {
        const values = taskHubColumns.map((column) => taskHubValue(row, column.key, billingByCode, elByCode));
        const matchesSearch = !query || values.some((value) => value.toLocaleLowerCase().includes(query));
        const matchesColumns = taskHubColumns.every((column) => {
          const filterValue = String(columnFilters[column.key] ?? "").trim().toLocaleLowerCase();
          return !filterValue || taskHubValue(row, column.key, billingByCode, elByCode).toLocaleLowerCase().includes(filterValue);
        });
        return matchesSearch && matchesColumns;
      });

    if (!sortState) return filtered;
    const direction = sortState.dir === "asc" ? 1 : -1;
    return [...filtered].sort((first, second) =>
      taskHubValue(first, sortState.key, billingByCode, elByCode).localeCompare(
        taskHubValue(second, sortState.key, billingByCode, elByCode),
        undefined,
        { numeric: true, sensitivity: "base" }
      ) * direction
    );
  }, [billingByCode, columnFilters, elByCode, rows, search, sortState]);

  const hasActiveFilters = taskHubColumns.some((column) => String(columnFilters[column.key] ?? "").trim());

  function toggleSort(key: TaskHubColumnKey) {
    setSortState((current) => {
      if (current?.key !== key) return { dir: "asc", key };
      if (current.dir === "asc") return { dir: "desc", key };
      return null;
    });
  }

  function clearFilters() {
    setColumnFilters({});
    setSearch("");
  }

  async function openThread(code: string, team: string) {
    setThread({ code, team });
    setMessages([]);
    setMessageDraft("");
    setMessageError("");
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
    const bodyText = messageDraft.trim();
    const row = rows.find((item) => String(item.task_code ?? "").trim() === thread.code);
    const entity = row ? String(row.entity ?? "") : "";
    const task = row ? String(row.task ?? "") : "";
    const optimisticId = `temp-${Date.now()}`;
    const optimistic = { author_name: "You", body: bodyText, created_at: new Date().toISOString(), id: optimisticId };
    setMessages((current) => [...current, optimistic]);
    setMessageDraft("");
    setMessageError("");
    setSending(true);
    try {
      const response = await fetch("/api/task-messages", {
        body: JSON.stringify({ body: bodyText, code: thread.code, entity, task, team: thread.team }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(result?.error ?? "Message could not be sent."));
      }
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setMessageDraft(bodyText);
      setMessageError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex shrink-0 items-center gap-3">
          <Link className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50" href="/taskline">
            <ArrowLeft className="size-4" />
            TaskLine
          </Link>
          <div>
            <h2 className="text-xl font-black text-slate-950">Task Hub</h2>
            <p className="text-xs font-bold text-slate-500">
              {isLoading ? "Loading..." : `${codedTasks.length} coded tasks`}
            </p>
          </div>
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
        {hasActiveFilters || search ? (
          <button
            className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
            onClick={clearFilters}
            type="button"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="mt-4 max-h-[calc(100vh-200px)] overflow-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <colgroup>
            {taskHubColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
            <col style={{ width: 72 }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
            <tr>
              {taskHubColumns.map((column) => {
                const isAscending = sortState?.key === column.key && sortState.dir === "asc";
                const isDescending = sortState?.key === column.key && sortState.dir === "desc";
                const isFiltered = Boolean(String(columnFilters[column.key] ?? "").trim());
                return (
                  <th className="border-r border-slate-200 px-3 py-2 last:border-r-0" key={column.key}>
                    <div className="flex items-center gap-1">
                      <button
                        className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left"
                        onClick={() => toggleSort(column.key)}
                        title={`Sort by ${column.label}`}
                        type="button"
                      >
                        <span className="min-w-0 leading-tight">{column.label}</span>
                        <span className="flex shrink-0 flex-col leading-none">
                          <ArrowUp className={`size-3 ${isAscending ? "text-navy-700" : "text-slate-300"}`} />
                          <ArrowDown className={`-mt-1 size-3 ${isDescending ? "text-navy-700" : "text-slate-300"}`} />
                        </span>
                      </button>
                      <button
                        aria-label={`Focus ${column.label} filter`}
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded border transition ${
                          isFiltered ? "border-navy-600 bg-navy-600 text-white" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100"
                        }`}
                        onClick={() => document.getElementById(`task-hub-filter-${column.key}`)?.focus()}
                        title={`Filter ${column.label}`}
                        type="button"
                      >
                        <Filter className="size-3" />
                      </button>
                    </div>
                  </th>
                );
              })}
              <th className="px-3 py-2">Chat</th>
            </tr>
            <tr className="bg-slate-50">
              {taskHubColumns.map((column) => (
                <th className="border-r border-slate-200 px-2 py-1 last:border-r-0" key={`filter-${column.key}`}>
                  <input
                    aria-label={`Filter ${column.label}`}
                    className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold normal-case text-slate-950 outline-none focus:border-navy-400"
                    id={`task-hub-filter-${column.key}`}
                    onChange={(event) => setColumnFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                    placeholder="Filter"
                    value={columnFilters[column.key] ?? ""}
                  />
                </th>
              ))}
              <th className="bg-slate-50 px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={10}>Loading...</td></tr>
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
                    {String(row.billable ?? "") ? (
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${String(row.billable).toLowerCase() === "no" ? "bg-slate-200 text-slate-600" : "bg-navy-100 text-navy-700"}`}>
                        {row.billable}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {billingStatus ? (
                      <span className="font-bold text-slate-800">{billingStatus}</span>
                    ) : String(row.billable ?? "").toLowerCase() === "no" ? (
                      <span className="text-xs font-bold text-slate-400">Non-billable</span>
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
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={10}>No coded tasks yet. New tasks added in TaskLine will appear here with their Task Code.</td></tr>
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
            <div className="border-t border-slate-200 px-4 py-3">
              {messageError ? <p className="mb-2 text-xs font-bold text-rose-600">{messageError}</p> : null}
              <div className="flex gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-navy-400"
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && sendMessage()}
                  placeholder="First message: tag a teammate with @email"
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
        </div>
      ) : null}
    </section>
  );
}

function taskHubValue(
  row: TaskLineRow,
  key: TaskHubColumnKey,
  billingByCode: Map<string, string>,
  elByCode: Map<string, { no: string; status: string }>
) {
  const code = String(row.task_code ?? "").trim();
  if (key === "entity") return String(row.entity || row.entity_group || "").trim();
  if (key === "el") {
    const el = elByCode.get(code);
    return el ? [el.no || "Generated", el.status].filter(Boolean).join(" · ") : "Not generated";
  }
  if (key === "billing") {
    return billingByCode.get(code) || (String(row.billable ?? "").toLocaleLowerCase() === "no" ? "Non-billable" : "");
  }
  return String(row[key] ?? "").trim();
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}
