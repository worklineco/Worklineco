"use client";

import { AlertTriangle, ChevronDown, ChevronRight, Download, FileText, RefreshCw, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

type GstClient = { gstin: string; group: string; hasCredentials: boolean; name: string };
type DetailTable = { headers: string[]; rows: string[][] };
type DetailTab = { name: string; tables: DetailTable[] };
type RawPayload = { demandAmount?: string; detail?: { tabs?: DetailTab[] } } | null;
type SourceKey = "appeal" | "notices" | "payment" | "spl";
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

const noticeColumns: { key: DisplayKey; label: string }[] = [
  { key: "ref_id", label: "Notice / Demand Order Id" },
  { key: "notice_type", label: "Type" },
  { key: "description", label: "Notice / Order Description" },
  { key: "date_of_issue", label: "Date of Issuance" },
  { key: "due_date", label: "Due Date" }
];

type CaseGroup = {
  caseId: string;
  key: string;
  notices: GstCase[];
  openClosed: "Closed" | "Open";
  period: string;
  status: string;
  tabs: DetailTab[];
  type: string;
};

// A case is Closed only when it is a Voluntary Payment or an Appeal Order;
// every other type/status (including other orders) is treated as Open.
function deriveOpenClosed(text: string): "Closed" | "Open" {
  const value = text.toLowerCase();
  if (value.includes("voluntary") || value.includes("appeal order")) {
    return "Closed";
  }
  return "Open";
}

// Groups the saved notices by Case ID so the tracker shows one row per case.
function groupByCase(cases: GstCase[]): CaseGroup[] {
  const map = new Map<string, CaseGroup>();
  for (const notice of cases) {
    const caseId = (notice.case_id ?? "").trim();
    const key = caseId || notice.ref_id || notice.id;
    let group = map.get(key);
    if (!group) {
      group = { caseId: caseId || "—", key, notices: [], openClosed: "Open", period: "", status: "", tabs: [], type: "" };
      map.set(key, group);
    }
    group.notices.push(notice);
    if (!group.type && notice.notice_type) {
      group.type = notice.notice_type;
    }
    if (!group.period && notice.tax_period) {
      group.period = notice.tax_period;
    }
    if (!group.status && notice.status) {
      group.status = notice.status;
    }
    const tabs = notice.raw_payload?.detail?.tabs ?? [];
    if (tabs.length && !group.tabs.length) {
      group.tabs = tabs;
    }
  }

  // Fallback: when a case has no captured Tax Period / Status, use the notice's
  // Date of Issuance for the period and its Description for the status.
  for (const group of map.values()) {
    if (!group.period) {
      const issueDate = group.notices.find((notice) => notice.date_of_issue)?.date_of_issue;
      if (issueDate) {
        group.period = isoToDmy(issueDate);
      }
    }
    if (!group.status) {
      const description = group.notices.find((notice) => notice.description)?.description;
      if (description) {
        group.status = description;
      }
    }
    const descriptions = group.notices.map((notice) => notice.description ?? "").join(" ");
    group.openClosed = deriveOpenClosed(`${group.status} ${group.type} ${descriptions}`);
  }

  return [...map.values()];
}

function isoToDmy(value: string | null): string {
  if (!value) {
    return "";
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value);
}

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
  const [filters, setFilters] = useState<{ caseId: string; openClosed: string; period: string; status: string; type: string }>({
    caseId: "",
    openClosed: "",
    period: "",
    status: "",
    type: ""
  });
  const [sourceSelection, setSourceSelection] = useState<Record<SourceKey, boolean>>({
    appeal: true,
    notices: true,
    payment: true,
    spl: true
  });

  const selectedClient = useMemo(() => clients.find((client) => client.gstin === selectedGstin) ?? null, [clients, selectedGstin]);
  const watchTokenRef = useRef(0);

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

    const sources = (Object.keys(sourceSelection) as SourceKey[]).filter((key) => sourceSelection[key]);
    if (!sources.length) {
      setError("Tick at least one source to update.");
      return;
    }

    setIsFetching(true);
    try {
      // The signed-in session fetches this client's GST login from Client
      // Records and hands it to the local helper for this one run - no key
      // file or Excel sheet is needed on this computer.
      const loginResponse = await fetch(`/api/gst?gstin=${encodeURIComponent(selectedGstin)}&login=1`, { cache: "no-store" });
      const loginResult = (await loginResponse.json().catch(() => ({}))) as {
        login?: { clientName?: string; password?: string; userId?: string } | null;
      };
      const login = loginResult.login;
      if (!loginResponse.ok || !login?.userId || !login?.password) {
        setError("No GST ID / Password is saved for this client in Client Records. Add them there first.");
        return;
      }

      const startPayload = {
        clientName: login.clientName ?? "",
        gstPass: login.password,
        gstUser: login.userId,
        gstin: selectedGstin,
        sources
      };
      const startedAt = Date.now();

      try {
        const response = await fetch(`${HELPER_URL}/start`, {
          body: JSON.stringify(startPayload),
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
        scheduleRefreshes();
        void watchAndSaveResults(selectedGstin, startPayload.clientName, sources, startedAt);
      } catch {
        // Helper isn't running yet — launch it via the WorkLine GST Helper
        // protocol, then start the fetch (with the login) once it is up.
        startHelperViaProtocol(selectedGstin);
        setMessage(
          "Starting the WorkLine GST Helper on this computer… if your browser asks to open “WorkLine GST Helper”, click Open. A portal window will appear — enter the CAPTCHA there and the data will save automatically."
        );
        void startWhenHelperReady(startPayload, sources, startedAt);
      }
    } finally {
      setIsFetching(false);
    }
  }

  function startHelperViaProtocol(gstin: string) {
    const url = `workline-gst://?gstin=${encodeURIComponent(gstin)}`;
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.src = url;
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 4000);
  }

  function scheduleRefreshes() {
    for (const delay of [15000, 30000, 45000, 60000, 90000, 120000]) {
      window.setTimeout(() => void loadCases(selectedGstin), delay);
    }
  }

  async function startWhenHelperReady(
    startPayload: { clientName: string; gstPass: string; gstUser: string; gstin: string; sources: SourceKey[] },
    sources: SourceKey[],
    startedAt: number
  ) {
    // Give the helper a few seconds to come up, then start the fetch with
    // the login included.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      try {
        const health = await fetch(`${HELPER_URL}/health`, { cache: "no-store" });
        if (health.ok) {
          await fetch(`${HELPER_URL}/start`, {
            body: JSON.stringify(startPayload),
            headers: { "Content-Type": "application/json" },
            method: "POST"
          }).catch(() => undefined);
          setMessage(
            "The portal is opening — enter the CAPTCHA in the browser window. The notices save automatically; this list refreshes on its own, or click Refresh."
          );
          scheduleRefreshes();
          void watchAndSaveResults(startPayload.gstin, startPayload.clientName, sources, startedAt);
          return;
        }
      } catch {
        // keep waiting
      }
    }
    setError(
      "The WorkLine GST Helper didn’t start. Open it once from Tools → install/start the GST Helper, then click Get data again."
    );
  }

  async function watchAndSaveResults(gstin: string, clientName: string, sources: SourceKey[], startedAt: number) {
    // Wait for the helper to finish the scrape (the user still types the
    // CAPTCHA), then relay the extracted rows to WorkLine through the
    // signed-in session - the helper itself never needs database keys.
    const watchToken = (watchTokenRef.current += 1);
    const deadline = Date.now() + 10 * 60 * 1000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      if (watchTokenRef.current !== watchToken) {
        return;
      }
      try {
        const response = await fetch(`${HELPER_URL}/latest?gstin=${encodeURIComponent(gstin)}`, { cache: "no-store" });
        if (!response.ok) {
          continue;
        }
        const output = (await response.json().catch(() => null)) as {
          extractedAt?: string;
          rows?: unknown[];
          sources?: string[];
        } | null;
        const extractedAt = Date.parse(String(output?.extractedAt ?? ""));
        if (!output || Number.isNaN(extractedAt) || extractedAt < startedAt - 60_000) {
          continue;
        }

        const saveResponse = await fetch("/api/gst", {
          body: JSON.stringify({
            action: "sync",
            clientName,
            extractedAt: output.extractedAt,
            gstin,
            rows: output.rows ?? [],
            sources: output.sources ?? sources
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST"
        });
        const saveResult = (await saveResponse.json().catch(() => ({}))) as { error?: string; saved?: number };
        if (!saveResponse.ok) {
          setError(saveResult.error ?? "Could not save the fetched notices to WorkLine.");
          return;
        }
        setMessage(`Saved ${saveResult.saved ?? (output.rows ?? []).length} notice row(s) from the portal.`);
        void loadCases(gstin);
        return;
      } catch {
        // helper busy or not reachable - keep waiting
      }
    }
  }

  async function deleteCaseGroup(group: CaseGroup) {
    if (!window.confirm(`Remove case ${group.caseId} and its ${group.notices.length} notice(s) from the tracker?`)) {
      return;
    }
    await Promise.all(
      group.notices.map((notice) => fetch(`/api/gst?id=${encodeURIComponent(notice.id)}`, { method: "DELETE" }))
    );
    void loadCases(selectedGstin);
  }

  // Payment-towards-Demand rows aren't cases — they carry a demand amount keyed
  // by notice/order number, shown as a column on the matching case.
  const paymentByRef = new Map<string, string>();
  for (const notice of cases) {
    if (notice.source === "payment") {
      const amount = notice.raw_payload?.demandAmount ?? "";
      const ref = (notice.ref_id ?? notice.case_id ?? "").trim().toUpperCase();
      if (ref && amount) {
        paymentByRef.set(ref, amount);
      }
    }
  }
  const displayCases = cases.filter((notice) => notice.source !== "payment");
  const caseGroups = groupByCase(displayCases);
  const demandForGroup = (group: CaseGroup): string => {
    let total = 0;
    let matched = false;
    for (const notice of group.notices) {
      const keys = [notice.ref_id, notice.case_id].map((value) => (value ?? "").trim().toUpperCase()).filter(Boolean);
      for (const key of keys) {
        const amount = paymentByRef.get(key);
        if (amount) {
          matched = true;
          total += Number(String(amount).replace(/[^\d.]/g, "")) || 0;
          break;
        }
      }
    }
    return matched ? `₹${total.toLocaleString("en-IN")}` : "—";
  };
  const filteredGroups = caseGroups.filter((group) => {
    const match = (value: string, filter: string) => !filter.trim() || value.toLowerCase().includes(filter.trim().toLowerCase());
    return (
      match(group.caseId, filters.caseId) &&
      match(group.type, filters.type) &&
      match(group.period, filters.period) &&
      match(group.status, filters.status) &&
      match(group.openClosed, filters.openClosed)
    );
  });

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

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Update from portal:</span>
          {([
            ["notices", "View Notices & Orders"],
            ["appeal", "Appeal to Appellate Authority"],
            ["spl", "SPL (Waiver 128A)"],
            ["payment", "Payment towards Demand"]
          ] as [SourceKey, string][]).map(([key, label]) => (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-slate-700" key={key}>
              <input
                checked={sourceSelection[key]}
                className="size-4 rounded border-slate-300 text-navy-700 focus:ring-navy-400"
                onChange={(event) => setSourceSelection((previous) => ({ ...previous, [key]: event.target.checked }))}
                type="checkbox"
              />
              {label}
            </label>
          ))}
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
            {selectedClient ? `Cases — ${selectedClient.name}` : "Cases"}
            <span className="ml-2 text-xs font-bold text-slate-400">
              {caseGroups.length} case{caseGroups.length === 1 ? "" : "s"} · {displayCases.length} notice{displayCases.length === 1 ? "" : "s"}
            </span>
          </h2>
          {lastScrapedAt ? (
            <span className="text-xs font-bold text-slate-400">Last updated {new Date(lastScrapedAt).toLocaleString("en-IN")}</span>
          ) : null}
        </div>

        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-[11px] font-black uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-8 border-b border-slate-200 px-2 py-2" />
                <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Case ID</th>
                <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Type</th>
                <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Tax Period</th>
                <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Status</th>
                <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Open / Closed</th>
                <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Demand Amount</th>
                <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Notices</th>
                <th className="border-b border-slate-200 px-3 py-2" />
              </tr>
              <tr className="bg-white">
                <th className="border-b border-slate-200 px-1 py-1" />
                <th className="border-b border-slate-200 px-1 py-1">
                  <FilterInput onChange={(value) => setFilters((previous) => ({ ...previous, caseId: value }))} value={filters.caseId} />
                </th>
                <th className="border-b border-slate-200 px-1 py-1">
                  <FilterInput onChange={(value) => setFilters((previous) => ({ ...previous, type: value }))} value={filters.type} />
                </th>
                <th className="border-b border-slate-200 px-1 py-1">
                  <FilterInput onChange={(value) => setFilters((previous) => ({ ...previous, period: value }))} value={filters.period} />
                </th>
                <th className="border-b border-slate-200 px-1 py-1">
                  <FilterInput onChange={(value) => setFilters((previous) => ({ ...previous, status: value }))} value={filters.status} />
                </th>
                <th className="border-b border-slate-200 px-1 py-1">
                  <select
                    className="h-7 w-full rounded border border-slate-200 bg-white px-1 text-[11px] font-bold text-slate-700 outline-none focus:border-navy-400"
                    onChange={(event) => setFilters((previous) => ({ ...previous, openClosed: event.target.value }))}
                    value={filters.openClosed}
                  >
                    <option value="">All</option>
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </th>
                <th className="border-b border-slate-200 px-1 py-1" />
                <th className="border-b border-slate-200 px-1 py-1" />
                <th className="border-b border-slate-200 px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {!selectedGstin ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={9}>
                    Select a client to see its cases.
                  </td>
                </tr>
              ) : filteredGroups.length ? (
                filteredGroups.map((group) => {
                  const isExpanded = expandedId === group.key;
                  return (
                    <Fragment key={group.key}>
                      <tr
                        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                        onClick={() => setExpandedId(isExpanded ? null : group.key)}
                      >
                        <td className="px-2 py-2 align-top text-slate-400">
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </td>
                        <td className="px-3 py-2 align-top font-bold text-navy-800">{group.caseId || "—"}</td>
                        <td className="px-3 py-2 align-top font-semibold text-slate-700">{group.type || "—"}</td>
                        <td className="px-3 py-2 align-top font-semibold text-slate-700">{group.period || "—"}</td>
                        <td className="px-3 py-2 align-top font-semibold text-slate-700">{group.status || "—"}</td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${
                              group.openClosed === "Closed" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {group.openClosed}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top font-black text-navy-800">{demandForGroup(group)}</td>
                        <td className="px-3 py-2 align-top font-semibold text-slate-500">{group.notices.length}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            aria-label="Remove case"
                            className="inline-flex size-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteCaseGroup(group);
                            }}
                            type="button"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td className="px-4 py-4" colSpan={9}>
                            <CaseDetail group={group} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={9}>
                    {isLoadingCases
                      ? "Loading…"
                      : cases.length
                        ? "No cases match the filters."
                        : "No cases saved yet. Click Get data to pull them from the portal."}
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

function CaseDetail({ group }: { group: CaseGroup }) {
  const tabs = group.tabs;
  const combined = buildCombinedProceedings(tabs);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-navy-100 bg-gradient-to-r from-navy-50 to-sky-50/40 px-4 py-3">
        <DetailField label="Case ID" value={group.caseId} />
        <span className="hidden h-8 w-px bg-navy-100 sm:block" />
        <DetailField label="Period" value={group.period} />
        <span className="hidden h-8 w-px bg-navy-100 sm:block" />
        <DetailField label="Status" value={group.status} />
        <span className="ml-auto">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black ${
              group.openClosed === "Closed" ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {group.openClosed}
          </span>
        </span>
      </div>

      <details className="group overflow-hidden rounded-lg border border-slate-200 bg-white">
        <summary className="flex cursor-pointer select-none items-center gap-2 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-navy-700 hover:bg-slate-100">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          Notices &amp; Orders in this case
          <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px] text-navy-700">{group.notices.length}</span>
        </summary>
        <div className="overflow-auto border-t border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 font-black uppercase tracking-wide text-slate-500">
              <tr>
                {noticeColumns.map((column) => (
                  <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2" key={String(column.key)}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.notices.map((notice, noticeIndex) => (
                <tr className={`border-b border-slate-100 last:border-b-0 ${noticeIndex % 2 ? "bg-slate-50/50" : ""}`} key={notice.id}>
                  {noticeColumns.map((column) => (
                    <td className="px-3 py-2 align-top font-semibold text-slate-700" key={String(column.key)}>
                      {formatCell(column.key, notice[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {combined.rows.length ? (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-wide text-navy-700">Case proceedings</p>
          <div className="overflow-auto rounded-lg border border-slate-200 shadow-sm">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-navy-700 text-[10px] font-black uppercase tracking-wide text-white">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Category</th>
                  {combined.columns.map((header, headerIndex) => (
                    <th className="whitespace-nowrap px-3 py-2" key={headerIndex}>
                      {header || "—"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {combined.rows.map((row, rowIndex) => (
                  <tr className={`border-b border-slate-100 last:border-b-0 ${rowIndex % 2 ? "bg-slate-50/60" : "bg-white"}`} key={rowIndex}>
                    <td className="whitespace-nowrap px-3 py-2 align-top">
                      <span className="flex flex-wrap gap-1">
                        {row.category.split(",").map((name, nameIndex) => (
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${categoryPillClass(name)}`}
                            key={nameIndex}
                          >
                            {name.trim()}
                          </span>
                        ))}
                      </span>
                    </td>
                    {row.cells.map((cell, cellIndex) => (
                      <td className="px-3 py-2 align-top font-semibold text-slate-700" key={cellIndex}>
                        {combined.columns[cellIndex]?.toLowerCase() === "attachments" ? (
                          <AttachmentCell value={cell} />
                        ) : (
                          cell || "—"
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-xs font-semibold text-slate-400">No sub-tab detail captured for this case yet.</p>
      )}
    </div>
  );
}

function categoryPillClass(name: string): string {
  const value = name.toLowerCase();
  if (value.includes("reply")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (value.includes("order")) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  if (value.includes("intimation")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (value.includes("notice")) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function AttachmentCell({ value }: { value: string }) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed.toLowerCase() === "-na-" || trimmed.toLowerCase() === "na") {
    return <span className="text-slate-400">—</span>;
  }
  const files = trimmed
    .split(/(?<=\.(?:pdf|png|jpe?g|xlsx?|docx?|zip))\s+/i)
    .map((file) => file.trim())
    .filter(Boolean);
  return (
    <span className="flex flex-col gap-1">
      {files.map((file, index) => (
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600" key={index}>
          <FileText className="size-3 shrink-0 text-slate-400" />
          <span className="truncate" title={file}>
            {file}
          </span>
        </span>
      ))}
    </span>
  );
}

// Maps equivalent sub-tab headers onto shared columns so Reply/Order references
// land in Reference Number, Reply/Order dates in Issue Date, and both
// personal-hearing columns become one.
function canonicalHeader(header: string): string {
  const value = header.trim().toLowerCase();
  if (/reply filed against|order no|order number|order id|demand order id|reference no|reference number|ref no|ref id|\barn\b/.test(value)) {
    return "Reference Number";
  }
  if (/reply date|order date|issue date|date of issuance/.test(value)) {
    return "Issue Date";
  }
  if (/personal hearing/.test(value)) {
    return "Personal Hearing";
  }
  return header.trim();
}

// Merges every sub-tab (Intimations / Notices / Replies / Orders) into one
// table with a Category column, deduping rows that repeat across sub-tabs.
function buildCombinedProceedings(tabs: DetailTab[]) {
  const columns: string[] = [];
  const seen = new Set<string>();
  const addColumn = (header: string) => {
    const label = canonicalHeader(header);
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      columns.push(label);
    }
  };

  const rowsByKey = new Map<string, { categories: string[]; values: Record<string, string> }>();

  for (const tab of tabs) {
    for (const table of tab.tables) {
      table.headers.forEach(addColumn);
      for (const cells of table.rows) {
        const values: Record<string, string> = {};
        table.headers.forEach((header, index) => {
          const label = canonicalHeader(header);
          const cell = cells[index] ?? "";
          if (label && (!values[label.toLowerCase()] || !values[label.toLowerCase()].trim()) && cell.trim()) {
            values[label.toLowerCase()] = cell;
          } else if (label && !(label.toLowerCase() in values)) {
            values[label.toLowerCase()] = cell;
          }
        });
        const key = Object.entries(values)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([header, value]) => `${header}=${value}`)
          .join("||");
        let record = rowsByKey.get(key);
        if (!record) {
          record = { categories: [], values };
          rowsByKey.set(key, record);
        }
        if (!record.categories.includes(tab.name)) {
          record.categories.push(tab.name);
        }
      }
    }
  }

  const rows = [...rowsByKey.values()].map((record) => ({
    category: record.categories.join(", "),
    cells: columns.map((header) => record.values[header.toLowerCase()] ?? "")
  }));

  return { columns, rows };
}

function FilterInput({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <input
      className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-navy-400"
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      placeholder="Filter"
      value={value}
    />
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-[10px] font-black uppercase tracking-wide text-navy-500">{label}</span>
      <span className="text-sm font-black text-navy-900">{value || "—"}</span>
    </span>
  );
}
