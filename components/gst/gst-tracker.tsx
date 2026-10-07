"use client";

import { AlertTriangle, Download, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type GstClient = { gstin: string; group: string; hasCredentials: boolean; name: string };
type GstCase = {
  case_id: string | null;
  date_of_issue: string | null;
  description: string | null;
  due_date: string | null;
  id: string;
  notice_type: string | null;
  ref_id: string | null;
  reply_filing_status: string | null;
  section: string | null;
  serial_no: number | null;
  source: string | null;
  status: string | null;
  tax_period: string | null;
};

const HELPER_URL = "http://127.0.0.1:48782";

const dateKeys = new Set<keyof GstCase>(["date_of_issue", "due_date"]);

// Shows stored dates (ISO yyyy-mm-dd) as dd-mm-yyyy; leaves other text as-is.
function formatCell(key: keyof GstCase, value: GstCase[keyof GstCase]) {
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

const columns: { key: keyof GstCase; label: string }[] = [
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
          <label className="flex min-w-[280px] flex-1 flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Client</span>
            <select
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-navy-400"
              onChange={(event) => setSelectedGstin(event.target.value)}
              value={selectedGstin}
            >
              <option value="">Select a client…</option>
              {clients.map((client) => (
                <option key={client.gstin} value={client.gstin}>
                  {client.name} — {client.gstin}
                  {client.hasCredentials ? "" : " (no login saved)"}
                </option>
              ))}
            </select>
          </label>

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
                  <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={columns.length + 1}>
                    Select a client to see its notices and orders.
                  </td>
                </tr>
              ) : cases.length ? (
                cases.map((row) => (
                  <tr className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50" key={row.id}>
                    {columns.map((column) => (
                      <td className="px-3 py-2 align-top font-semibold text-slate-700" key={String(column.key)}>
                        {formatCell(column.key, row[column.key])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <button
                        aria-label="Remove notice"
                        className="inline-flex size-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                        onClick={() => void deleteCase(row.id)}
                        type="button"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={columns.length + 1}>
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
