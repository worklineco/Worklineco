"use client";

import { AlertTriangle, ChevronDown, ChevronRight, Download, RefreshCw, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type GstClient = { gstin: string; group: string; hasCredentials: boolean; name: string };
type DetailTable = { headers: string[]; rows: string[][] };
type DetailTab = { name: string; tables: DetailTable[] };
type RawPayload = { detail?: { tabs?: DetailTab[] } } | null;
type GstCase = {
  case_id: string | null;
  date_of_issue: string | null;
  description: string | null;
  due_date: string | null;
  id: string;
  notice_type: string | null;
  raw_payload: RawPayload;
  ref_id: string | null;
  reply_filing_status: string | null;
  section: string | null;
  serial_no: number | null;
  source: string | null;
  status: string | null;
  tax_period: string | null;
};

const HELPER_URL = "http://127.0.0.1:48782";

type DisplayKey = "ref_id" | "notice_type" | "description" | "date_of_issue" | "due_date";

const dateKeys = new Set<DisplayKey>(["date_of_issue", "due_date"]);

// Shows stored dates (ISO yyyy-mm-dd) as dd-mm-yyyy; leaves other text as-is.
function formatCell(key: DisplayKey, value: string | null) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (dateKeys.has(key)) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
  }
  return value;
}

// Searchable client picker — filters by name or GSTIN as you type.
function ClientSelect({ clients, onChange, value }: { clients: GstClient[]; onChange: (gstin: string) => void; value: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => clients.find((client) => client.gstin === value) ?? null, [clients, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return clients;
    }
    return clients.filter((client) => client.name.toLowerCase().includes(q) || client.gstin.toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <div className="relative">
      <input
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-navy-400"
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder="Search client by name or GSTIN…"
        value={open ? query : selected ? `${selected.name} — ${selected.gstin}` : ""}
      />
      {open ? (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length ? (
            filtered.slice(0, 300).map((client, index) => (
              <li key={`${client.gstin}-${index}`}>
                <button
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    client.gstin === value ? "bg-navy-50 font-bold text-navy-800" : "font-semibold text-slate-700"
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(client.gstin);
                    setOpen(false);
                    setQuery("");
                  }}
                  type="button"
                >
                  {client.name} — {client.gstin}
                  {client.hasCredentials ? "" : <span className="text-slate-400"> (no login saved)</span>}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm font-semibold text-slate-400">No matching client.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

const columns: { key: DisplayKey; label: string }[] = [
  { key: "ref_id", label: "Notice / Demand Order Id" },
  { key: "notice_type", label: "Type" },
  { key: "description", label: "Notice / Order Description" },
  { key: "date_of_issue", label: "Date of Issuance" },
  { key: "due_date", label: "Due Date" }
];

export function GstTracker() {
  const [clients, setClients] = useState<GstClient[]>([]);
  const [selectedGstin, setSelectedGstin] = useState("");
  const [cases, setCases] = useState<GstCase[]>([]);
  const [lastScrapedAt, setLastScrapedAt] = useState<string | null>(null);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const selectedClient = useMemo(() => clients.find((client) => client.gstin === selectedGstin) ?? null, [clients, selectedGstin]);

  useEffect(() => {
    fetch("/api/gst", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { clients: [] }))
      .then((data) => setClients(Array.isArray(data?.clients) ? (data.clients as GstClient[]) : []))
      .catch(() => setError("Could not load clients from Client Records."));
  }, []);

  const loadCases = useCallback(async (gstin: string) => {
    if (!gstin) {
      setCases([]);
      setLastScrapedAt(null);
      return;
    }
    setIsLoadingCases(true);
    try {
      const response = await fetch(`/api/gst?gstin=${encodeURIComponent(gstin)}`, { cache: "no-store" });
      const data = (await response.json()) as { cases?: GstCase[]; lastScrapedAt?: string | null };
      setCases(Array.isArray(data?.cases) ? data.cases : []);
      setLastScrapedAt(data?.lastScrapedAt ?? null);
    } catch {
      setError("Could not load saved notices for this client.");
    } finally {
      setIsLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    void loadCases(selectedGstin);
  }, [selectedGstin, loadCases]);

  async function getDataFromPortal() {
    if (!selectedClient) {
      return;
    }
    setError("");
    setMessage("");

    if (!selectedClient.hasCredentials) {
      setError("No GST ID / Password is saved for this client in Client Records. Add them there first.");
      return;
    }

    setIsFetching(true);
    try {
      const response = await fetch(`${HELPER_URL}/start`, {
        body: JSON.stringify({ gstin: selectedGstin }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        setError(result.error ?? "The GST helper could not start the fetch.");
        return;
      }
      setMessage(
        result.message ??
          "A browser window opened on the GST portal. Enter the CAPTCHA there — the helper will log in, open View Notices and Orders, and save the data. Then click Refresh."
      );
      // Auto-refresh a few times while the scrape runs.
      for (const delay of [15000, 30000, 45000, 60000]) {
        window.setTimeout(() => void loadCases(selectedGstin), delay);
      }
    } catch {
      setError(
        "Couldn't reach the local WorkLine GST Helper. Make sure it's running on this computer (Tools → install/start the GST Helper), then try again."
      );
    } finally {
      setIsFetching(false);
    }
  }

  async function deleteCase(id: string) {
    if (!window.confirm("Remove this notice from the tracker?")) {
      return;
    }
    await fetch(`/api/gst?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    void loadCases(selectedGstin);
  }

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-navy-600">GST Tracker</p>
        <h1 className="mt-1 text-2xl font-black text-navy-900">Notices &amp; Orders from the GST portal</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Pick a client, click Get data, clear the portal CAPTCHA once, and the View Notices &amp; Orders list is pulled in
          and saved here for the whole firm to see.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex min-w-[280px] flex-1 flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Client</span>
            <ClientSelect clients={clients} onChange={setSelectedGstin} value={selectedGstin} />
          </div>

          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-black text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedGstin || isFetching}
            onClick={getDataFromPortal}
            type="button"
          >
            <Download className="size-4" />
            {isFetching ? "Opening portal…" : "Get data"}
          </button>

          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            disabled={!selectedGstin || isLoadingCases}
            onClick={() => void loadCases(selectedGstin)}
            type="button"
          >
            <RefreshCw className={`size-4 ${isLoadingCases ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {message ? (
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
          <h2 className="text-sm font-black text-navy-800">
            {selectedClient ? `Notices & Orders — ${selectedClient.name}` : "Notices & Orders"}
            <span className="ml-2 text-xs font-bold text-slate-400">{cases.length} row{cases.length === 1 ? "" : "s"}</span>
          </h2>
          {lastScrapedAt ? (
            <span className="text-xs font-bold text-slate-400">Last updated {new Date(lastScrapedAt).toLocaleString("en-IN")}</span>
          ) : null}
        </div>

        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-[11px] font-black uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-8 border-b border-slate-200 px-2 py-2" />
                {columns.map((column) => (
                  <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2" key={String(column.key)}>
                    {column.label}
                  </th>
                ))}
                <th className="border-b border-slate-200 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {!selectedGstin ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={columns.length + 2}>
                    Select a client to see its notices and orders.
                  </td>
                </tr>
              ) : cases.length ? (
                cases.map((row) => {
                  const isExpanded = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        <td className="px-2 py-2 align-top text-slate-400">
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </td>
                        {columns.map((column) => (
                          <td className="px-3 py-2 align-top font-semibold text-slate-700" key={String(column.key)}>
                            {formatCell(column.key, row[column.key])}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right">
                          <button
                            aria-label="Remove notice"
                            className="inline-flex size-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteCase(row.id);
                            }}
                            type="button"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td className="px-4 py-4" colSpan={columns.length + 2}>
                            <NoticeDetail row={row} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={columns.length + 2}>
                    {isLoadingCases ? "Loading…" : "No notices saved yet. Click Get data to pull them from the portal."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NoticeDetail({ row }: { row: GstCase }) {
  const tabs = row.raw_payload?.detail?.tabs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <DetailField label="Case ID" value={row.case_id} />
        <DetailField label="Period" value={row.tax_period} />
        <DetailField label="Status" value={row.status} />
      </div>

      {tabs.length ? (
        tabs.map((tab, tabIndex) => (
          <div className="space-y-2" key={`${tab.name}-${tabIndex}`}>
            <p className="text-xs font-black uppercase tracking-wide text-navy-700">{tab.name}</p>
            {tab.tables.map((table, tableIndex) => (
              <div className="overflow-auto rounded-lg border border-slate-200 bg-white" key={tableIndex}>
                <table className="w-full border-collapse text-left text-xs">
                  {table.headers.length ? (
                    <thead className="bg-slate-100 font-black uppercase tracking-wide text-slate-600">
                      <tr>
                        {table.headers.map((header, headerIndex) => (
                          <th className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5" key={headerIndex}>
                            {header || "—"}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  ) : null}
                  <tbody>
                    {table.rows.map((cells, rowIndex) => (
                      <tr className="border-b border-slate-100 last:border-b-0" key={rowIndex}>
                        {cells.map((cell, cellIndex) => (
                          <td className="px-2 py-1.5 align-top font-semibold text-slate-700" key={cellIndex}>
                            {cell || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))
      ) : (
        <p className="text-xs font-semibold text-slate-400">No detail captured for this notice yet.</p>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value || "—"}</span>
    </span>
  );
}
