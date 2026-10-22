"use client";

import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Download, FileText, Filter, Network, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filterOptionHighlightClass, useFilterMenuKeys } from "@/components/shared/filter-menu-keys";

type GstClient = { gstin: string; group: string; hasCredentials: boolean; name: string };
type DetailTable = { headers: string[]; rows: string[][] };
type DetailTab = { name: string; tables: DetailTable[] };
type RawPayload = {
  againstOrderNo?: string;
  demandAmount?: string;
  demandBreakup?: Record<string, Record<string, number>>;
  demandDate?: string;
  demandProblems?: string[];
  detail?: { tabs?: DetailTab[] };
} | null;
// One Payment-towards-Demand row, ready for the breakup popup: per tax head,
// the figures the collector read from the portal's bifurcation popups.
type DemandInfo = { amount: number; breakup: Record<string, Record<string, number>>; date: string; demandId: string; problems: string[] };
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

// ---------------------------------------------------------------------------
// Case Map — one row per case, charting the proceeding end to end the way the
// firm's Excel tracker did: intimation -> show cause -> reply -> hearing ->
// order -> payment -> appeal. A stage that never happened stays blank instead
// of shifting the others along.

const caseStages = ["Application", "Intimation", "Show Cause", "Reply", "Hearing", "Order", "Rectification", "Payment", "Appeal"] as const;
type CaseStage = (typeof caseStages)[number];

// Checked in order — the first match wins, so "Intimation for adjournment of
// hearing" lands on Hearing rather than Intimation, and DRC-01A/-01C
// (intimations that contain "drc-01") are caught before the Show Cause rule.
const stageRules: [CaseStage, string[]][] = [
  ["Appeal", ["appeal", "apl-01", "apl 01"]],
  ["Rectification", ["rectif"]],
  ["Payment", ["voluntary payment", "drc-03", "drc 03", "acknowledgement of acceptance", "payment towards demand"]],
  ["Order", [
    "order for determination", "summary order", "drc-07", "drc 07", "asmt-12", "asmt 12", "drop proceedings",
    "proceedings dropped", "spl 05", "spl-05", "spl 07", "spl-07", "approval of waiver", "rejection of waiver",
    "adt-02", "adt 02", "audit report", "order of amendment", "registration certificate", "order rectified",
    "order for creation of demand", "order of rejection", "order of acceptance", "deemed approv", "letter of undertaking"
  ]],
  ["Hearing", ["personal hearing", "adjourn", "hearing"]],
  ["Intimation", ["drc-01a", "drc-01c", "drc 01a", "drc 01c"]],
  ["Show Cause", ["show cause", "drc-01 ", "drc-01)", "form gst drc-01", "spl-03", "spl 03"]],
  ["Intimation", [
    "asmt-10", "asmt 10", "adt-01", "adt 01", "discrepancy", "intimation", "itc mismatch", "return defaulter",
    "seeking additional information", "notice"
  ]]
];

function stageOf(text: string): CaseStage | null {
  const blob = text.toLowerCase();
  for (const [stage, keys] of stageRules) {
    if (keys.some((key) => blob.includes(key))) {
      return stage;
    }
  }
  return null;
}

// Buckets a case into the categories that matter for tracking — same rules as
// the firm's Excel tracker.
function categoryOf(text: string): string {
  const blob = text.toLowerCase();
  if (blob.includes("voluntary payment") || blob.includes("drc-03") || blob.includes("drc 03")) {
    return "Voluntary Payment";
  }
  if (blob.includes("rectif")) {
    return "Rectification";
  }
  if (blob.includes("spl") || blob.includes("128a") || blob.includes("waiver")) {
    return "Waiver / SPL 128A";
  }
  if (blob.includes("appeal")) {
    return "Appeal";
  }
  if (blob.includes("audit")) {
    return "Audit";
  }
  if (blob.includes("scrutiny") || blob.includes("asmt")) {
    return "Scrutiny";
  }
  if (blob.includes("determination of tax") || blob.includes("drc-01") || blob.includes("demand")) {
    return "Demand / Adjudication";
  }
  if (blob.includes("return defaulter") || blob.includes("not filing return")) {
    return "Return Default";
  }
  if (blob.includes("registration certificate") || blob.includes("amendment")) {
    return "Registration";
  }
  if (blob.includes("refund")) {
    return "Refund";
  }
  if (blob.includes("letter of undertaking") || blob.includes("furnishing lut")) {
    return "LUT";
  }
  if (blob.includes("penalty")) {
    return "Penalty";
  }
  if (blob.includes("enforcement")) {
    return "Enforcement";
  }
  if (blob.includes("order")) {
    return "Order";
  }
  return "Other";
}

const closedWords = ["approved", "closed", "completed", "disposed", "dropped", "rejected"];

// Reads ISO (yyyy-mm-dd) or portal (dd/mm/yyyy, dd-mm-yyyy) dates.
function parseAnyDate(value: string | null | undefined): Date | null {
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  match = text.match(/\b(\d{2})[-/](\d{2})[-/](\d{4})\b/);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }
  return null;
}

function formatDmy(date: Date | null): string {
  if (!date) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

// Which stage a sub-tab row belongs to: the tab name decides where it can,
// and the row's own wording decides the rest.
function stageForTabRow(tabName: string, rowText: string): CaseStage | null {
  const name = tabName.toUpperCase();
  if (name.includes("REPL")) {
    return "Reply";
  }
  if (name.includes("ORDER")) {
    return "Order";
  }
  if (name.includes("RECTIF")) {
    return "Rectification";
  }
  if (name.includes("APPEAL") || name.includes("APL")) {
    return "Appeal";
  }
  if (name.includes("PAYMENT")) {
    return "Payment";
  }
  if (name.includes("APPLICATION")) {
    return "Application";
  }
  const byText = stageOf(rowText);
  if (name.includes("ACK")) {
    return byText ?? "Application";
  }
  return byText;
}

type CaseMapRow = {
  caseId: string;
  category: string;
  chain: CaseStage[];
  daysSince: number | null;
  docs: number;
  folded: string[];
  latest: string;
  open: boolean;
  period: string;
  refs: { refs: string[]; stage: CaseStage }[];
  stages: Partial<Record<CaseStage, string>>;
  status: string;
};

// Appeal folding — an appeal gets its own case page on the portal, so it
// would show twice: as the Appeal stage of the case it contests and as a case
// of its own. When an appeal row carries the order number it was filed
// against, its case folds into the case that owns that order — one row per
// dispute, same as the firm's Excel tracker — and every merge is shown on the
// parent so nothing disappears silently. An appeal whose contested order is
// not in the tracker stays as its own row.
function foldAppealGroups(groups: CaseGroup[]): { folded: Map<string, string[]>; groups: CaseGroup[] } {
  const tokenPattern = /\b[A-Z]{2}\d{10,}[A-Z0-9]*\b/g;
  const refOwner = new Map<string, string>();
  for (const group of groups) {
    if (!group.caseId || group.caseId === "—") {
      continue;
    }
    for (const notice of group.notices) {
      const texts = [notice.ref_id, notice.case_id, notice.description];
      for (const tab of notice.raw_payload?.detail?.tabs ?? []) {
        for (const table of tab.tables) {
          for (const cells of table.rows) {
            texts.push(cells.join(" "));
          }
        }
      }
      for (const text of texts) {
        for (const token of String(text ?? "").toUpperCase().match(tokenPattern) ?? []) {
          if (!refOwner.has(token)) {
            refOwner.set(token, group.caseId);
          }
        }
      }
    }
  }

  const alias = new Map<string, string>();
  for (const group of groups) {
    if (!group.caseId || group.caseId === "—") {
      continue;
    }
    const against = group.notices
      .map((notice) => (notice.raw_payload?.againstOrderNo ?? "").trim().toUpperCase())
      .find(Boolean);
    if (!against) {
      continue;
    }
    const parent = refOwner.get(against);
    if (parent && parent !== group.caseId) {
      alias.set(group.caseId, parent);
    }
  }

  // Resolve chains (an appeal against an appeal order), with a cycle guard.
  const resolved = new Map<string, string>();
  for (const start of alias.keys()) {
    const seen = new Set([start]);
    let current = alias.get(start) ?? start;
    while (alias.has(current) && !seen.has(current)) {
      seen.add(current);
      current = alias.get(current) ?? current;
    }
    if (current !== start) {
      resolved.set(start, current);
    }
  }
  if (!resolved.size) {
    return { folded: new Map(), groups };
  }

  const folded = new Map<string, string[]>();
  const out: CaseGroup[] = [];
  const parentCopies = new Map<string, CaseGroup>();
  for (const group of groups) {
    if (resolved.has(group.caseId)) {
      continue;
    }
    const copy = { ...group, notices: [...group.notices], tabs: [...group.tabs] };
    out.push(copy);
    if (!parentCopies.has(group.caseId)) {
      parentCopies.set(group.caseId, copy);
    }
  }
  for (const group of groups) {
    const parentId = resolved.get(group.caseId);
    if (!parentId) {
      continue;
    }
    const parent = parentCopies.get(parentId);
    if (!parent) {
      out.push(group);
      continue;
    }
    parent.notices.push(...group.notices);
    parent.tabs.push(...group.tabs);
    const list = folded.get(parentId) ?? [];
    list.push(group.caseId);
    folded.set(parentId, list);
  }
  return { folded, groups: out };
}

function buildCaseMap(groups: CaseGroup[], foldedByCase: Map<string, string[]> = new Map()): CaseMapRow[] {
  const rows: CaseMapRow[] = [];
  const today = new Date();

  for (const group of groups) {
    // A row with no Case ID is a notice whose case page was never reached —
    // it stays in the cases list but is not a case to map.
    if (!group.caseId || group.caseId === "—") {
      continue;
    }
    const blob = group.notices.map((notice) => `${notice.notice_type ?? ""} ${notice.description ?? ""}`).join(" ");
    const category = categoryOf(`${group.type} ${blob}`);
    // A DRC-03 voluntary payment is a one-off, self-initiated payment with no
    // notice -> order lifecycle to chart; it stays in the cases list only.
    if (category === "Voluntary Payment") {
      continue;
    }

    const stageDates = new Map<CaseStage, Date>();
    const stageRefs = new Map<CaseStage, string[]>();
    const allDates: Date[] = [];

    const note = (stage: CaseStage | null, date: Date | null, ref: string) => {
      if (date) {
        allDates.push(date);
      }
      if (!stage) {
        return;
      }
      // keep the EARLIEST date for a stage — that is when it started
      const previous = stageDates.get(stage);
      if (date && (!previous || date < previous)) {
        stageDates.set(stage, date);
      }
      const cleanRef = ref.trim();
      if (cleanRef) {
        const list = stageRefs.get(stage) ?? [];
        if (!list.includes(cleanRef)) {
          list.push(cleanRef);
          stageRefs.set(stage, list);
        }
      }
    };

    for (const notice of group.notices) {
      const stage = stageOf(`${notice.notice_type ?? ""} ${notice.description ?? ""}`);
      note(stage, parseAnyDate(notice.date_of_issue), notice.ref_id ?? "");
    }
    for (const tab of group.tabs) {
      for (const table of tab.tables) {
        for (const cells of table.rows) {
          const text = cells.join("  ");
          const reference = text.match(/\bZ[A-Z]\d{10,}[A-Z0-9]*\b/)?.[0] ?? "";
          note(stageForTabRow(tab.name, text), parseAnyDate(text), reference);
        }
      }
    }

    const chain = caseStages.filter((stage) => stageDates.has(stage) || stageRefs.has(stage));
    const latestDate = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null;
    const statusBlob = group.status.toLowerCase();
    const open = !closedWords.some((word) => statusBlob.includes(word)) && !chain.includes("Order");

    const stages: Partial<Record<CaseStage, string>> = {};
    for (const [stage, date] of stageDates) {
      stages[stage] = formatDmy(date);
    }

    rows.push({
      caseId: group.caseId,
      category,
      chain,
      daysSince: latestDate ? Math.floor((today.getTime() - latestDate.getTime()) / 86_400_000) : null,
      docs: group.notices.length,
      folded: foldedByCase.get(group.caseId) ?? [],
      latest: formatDmy(latestDate),
      open,
      period: group.period,
      refs: caseStages.filter((stage) => stageRefs.has(stage)).map((stage) => ({ refs: stageRefs.get(stage) ?? [], stage })),
      stages,
      status: group.status
    });
  }

  // newest activity first; cases with no date at all sink to the bottom
  rows.sort((a, b) => (a.daysSince ?? Number.MAX_SAFE_INTEGER) - (b.daysSince ?? Number.MAX_SAFE_INTEGER));
  return rows;
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
  const [viewMode, setViewMode] = useState<"cases" | "map">("cases");
  const [demandPopup, setDemandPopup] = useState<{ caseId: string; demands: DemandInfo[] } | null>(null);
  const [casesSort, setCasesSort] = useState<GstSortState>(null);
  const [casesValueFilters, setCasesValueFilters] = useState<Record<string, string[]>>({});
  const casesMenu = useGstFilterMenu();
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

      // Appeal / SPL searches skip the 90-day date ranges that returned no
      // records last time. Offer to re-check those known-empty ranges too.
      let searchEmpty = false;
      if (sources.includes("appeal") || sources.includes("spl")) {
        searchEmpty = window.confirm(
          "Appeal / SPL: also re-check the date ranges that previously found no records?\n\n" +
            "OK = re-check every date range (slower)\n" +
            "Cancel = search only new ranges and skip the known-empty ones (faster)"
        );
      }

      const startPayload = {
        clientName: login.clientName ?? "",
        gstPass: login.password,
        gstUser: login.userId,
        gstin: selectedGstin,
        searchEmpty,
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
    startPayload: { clientName: string; gstPass: string; gstUser: string; gstin: string; searchEmpty: boolean; sources: SourceKey[] },
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
    // Long enough for a big client plus the hand-typed login - a full
    // Sanganeriya run takes ~13 minutes before the output lands.
    const deadline = Date.now() + 30 * 60 * 1000;

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
        const envelope = (await response.json().catch(() => null)) as {
          extractedAt?: string;
          payload?: { extractedAt?: string; rows?: unknown[]; sources?: string[] };
          rows?: unknown[];
          sources?: string[];
        } | null;
        // The helper's /latest wraps the collector output in { fileName,
        // modifiedAt, payload } - reading extractedAt off the top level made
        // every poll skip, so the page never auto-saved a finished scrape.
        const output = envelope?.payload ?? envelope;
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
  // by notice/order number, shown as a column on the matching case. Clicking
  // the amount opens the head-wise bifurcation the collector read from the
  // portal's own popups (Tax / Interest / Penalty / Fee / Others per head).
  const demandByRef = new Map<string, DemandInfo>();
  for (const notice of cases) {
    if (notice.source === "payment") {
      // The stored reference is prefixed to keep it unique per registration;
      // the plain demand id lives in case_id, which is what cases match on.
      const ref = (notice.case_id ?? notice.ref_id ?? "").replace(/^DMD-/i, "").trim().toUpperCase();
      const amount = Number(String(notice.raw_payload?.demandAmount ?? "").replace(/[^\d.]/g, "")) || 0;
      if (ref && amount) {
        demandByRef.set(ref, {
          amount,
          breakup: notice.raw_payload?.demandBreakup ?? {},
          date: notice.raw_payload?.demandDate ?? "",
          demandId: ref,
          problems: notice.raw_payload?.demandProblems ?? [],
        });
      }
    }
  }
  const displayCases = cases.filter((notice) => notice.source !== "payment");
  const caseGroups = groupByCase(displayCases);
  const demandsForGroup = (group: CaseGroup): DemandInfo[] => {
    const found = new Map<string, DemandInfo>();
    for (const notice of group.notices) {
      const keys = [notice.ref_id, notice.case_id].map((value) => (value ?? "").trim().toUpperCase()).filter(Boolean);
      for (const key of keys) {
        const demand = demandByRef.get(key);
        if (demand) {
          found.set(demand.demandId, demand);
          break;
        }
      }
    }
    return [...found.values()];
  };
  const demandForGroup = (group: CaseGroup): string => {
    const demands = demandsForGroup(group);
    if (!demands.length) {
      return "—";
    }
    const total = demands.reduce((sum, demand) => sum + demand.amount, 0);
    return `₹${total.toLocaleString("en-IN")}`;
  };
  const showDemandBreakup = (group: CaseGroup) => {
    const demands = demandsForGroup(group);
    if (demands.length) {
      setDemandPopup({ caseId: group.caseId || demands[0].demandId, demands });
    }
  };
  const caseMapData = viewMode === "map" ? foldAppealGroups(caseGroups) : null;
  const caseMapRows = caseMapData ? buildCaseMap(caseMapData.groups, caseMapData.folded) : [];
  const caseCellValue = (group: CaseGroup, key: string): string => {
    switch (key) {
      case "caseId": return group.caseId;
      case "type": return group.type;
      case "period": return group.period;
      case "status": return group.status;
      case "openClosed": return group.openClosed;
      case "demand": return demandForGroup(group);
      case "notices": return String(group.notices.length);
      default: return "";
    }
  };
  const matchesTextFilters = (group: CaseGroup) => {
    const match = (value: string, filter: string) => !filter.trim() || value.toLowerCase().includes(filter.trim().toLowerCase());
    return (
      match(group.caseId, filters.caseId) &&
      match(group.type, filters.type) &&
      match(group.period, filters.period) &&
      match(group.status, filters.status) &&
      match(group.openClosed, filters.openClosed)
    );
  };
  const matchesValueFilters = (group: CaseGroup, exceptKey?: string) =>
    Object.entries(casesValueFilters).every(([key, values]) => key === exceptKey || !values.length || values.includes(caseCellValue(group, key)));
  const filteredGroups = caseGroups
    .filter((group) => matchesTextFilters(group) && matchesValueFilters(group))
    .sort((a, b) => {
      if (!casesSort) {
        return 0;
      }
      const valueA = caseCellValue(a, casesSort.key);
      const valueB = caseCellValue(b, casesSort.key);
      // Blanks sink to the bottom in BOTH directions.
      if (isBlankCell(valueA) || isBlankCell(valueB)) {
        return isBlankCell(valueA) && isBlankCell(valueB) ? 0 : isBlankCell(valueA) ? 1 : -1;
      }
      const delta = compareCellValues(valueA, valueB);
      return casesSort.dir === "asc" ? delta : -delta;
    });
  const toggleCasesSort = (key: string) =>
    setCasesSort((current) => (!current || current.key !== key ? { dir: "asc", key } : current.dir === "asc" ? { dir: "desc", key } : null));
  const openCasesFilter = (key: string, anchor: HTMLElement) => {
    // Excel-style: list the values that survive every OTHER active filter.
    const source = caseGroups.filter((group) => matchesTextFilters(group) && matchesValueFilters(group, key));
    const options = [...new Set(source.map((group) => caseCellValue(group, key)))].sort(compareCellValues);
    casesMenu.open(key, anchor, options, casesValueFilters[key] ?? []);
  };
  const applyCasesFilter = () => {
    const menu = casesMenu.menu;
    if (!menu) {
      return;
    }
    const selectedAll = menu.options.every((value) => casesMenu.draft.includes(value));
    setCasesValueFilters((current) => ({ ...current, [menu.key]: selectedAll ? [] : menu.options.filter((value) => casesMenu.draft.includes(value)) }));
    casesMenu.close();
  };
  const clearCasesFilter = () => {
    const menu = casesMenu.menu;
    if (menu) {
      setCasesValueFilters((current) => ({ ...current, [menu.key]: [] }));
    }
    casesMenu.close();
  };
  const caseColumns: { key: string; label: string }[] = [
    { key: "caseId", label: "Case ID" },
    { key: "type", label: "Type" },
    { key: "period", label: "Tax Period" },
    { key: "status", label: "Status" },
    { key: "openClosed", label: "Open / Closed" },
    { key: "demand", label: "Demand Amount" }
  ];

  return (
    <div className="mt-6 space-y-4">
      {demandPopup ? <DemandBreakupDialog caseId={demandPopup.caseId} demands={demandPopup.demands} onClose={() => setDemandPopup(null)} /> : null}
      {casesMenu.menu ? (
        <GstFilterMenu
          columnLabel={caseColumns.find((column) => column.key === casesMenu.menu?.key)?.label ?? ""}
          draft={casesMenu.draft}
          hasFilter={Boolean(casesValueFilters[casesMenu.menu.key]?.length)}
          menuPos={casesMenu.menu.menuPos}
          onApply={applyCasesFilter}
          onCancel={casesMenu.close}
          onClear={clearCasesFilter}
          onSearchChange={casesMenu.setSearch}
          onSortAsc={() => {
            setCasesSort({ dir: "asc", key: casesMenu.menu?.key ?? "" });
            casesMenu.close();
          }}
          onSortDesc={() => {
            setCasesSort({ dir: "desc", key: casesMenu.menu?.key ?? "" });
            casesMenu.close();
          }}
          onToggleAll={casesMenu.toggleAll}
          onToggleValue={casesMenu.toggleValue}
          search={casesMenu.search}
          visibleOptions={casesMenu.visibleOptions}
        />
      ) : null}
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
            {viewMode === "map" ? (selectedClient ? `Case Map — ${selectedClient.name}` : "Case Map") : selectedClient ? `Cases — ${selectedClient.name}` : "Cases"}
            <span className="ml-2 text-xs font-bold text-slate-400">
              {caseGroups.length} case{caseGroups.length === 1 ? "" : "s"} · {displayCases.length} notice{displayCases.length === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="flex items-center gap-3">
            {lastScrapedAt ? (
              <span className="text-xs font-bold text-slate-400">Last updated {new Date(lastScrapedAt).toLocaleString("en-IN")}</span>
            ) : null}
            {viewMode === "map" ? (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                onClick={() => setViewMode("cases")}
                type="button"
              >
                <ArrowLeft className="size-4" />
                Back to cases
              </button>
            ) : (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-navy-700 px-3 text-xs font-black text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedGstin}
                onClick={() => setViewMode("map")}
                type="button"
              >
                <Network className="size-4" />
                Case Map
              </button>
            )}
          </div>
        </div>

        {viewMode === "map" ? (
          <CaseMapList demandFor={demandForGroup} groups={caseMapData ? caseMapData.groups : caseGroups} hasClient={Boolean(selectedGstin)} isLoading={isLoadingCases} onShowDemand={showDemandBreakup} rows={caseMapRows} />
        ) : (
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-[11px] font-black uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-8 border-b border-slate-200 px-2 py-2" />
                {caseColumns.map((column) => (
                  <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2" key={column.key}>
                    <GstColumnHeader
                      hasFilter={Boolean(casesValueFilters[column.key]?.length)}
                      isAsc={casesSort?.key === column.key && casesSort.dir === "asc"}
                      isDesc={casesSort?.key === column.key && casesSort.dir === "desc"}
                      label={column.label}
                      onOpenFilter={(anchor) => openCasesFilter(column.key, anchor)}
                      onToggleSort={() => toggleCasesSort(column.key)}
                    />
                  </th>
                ))}
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
              </tr>
            </thead>
            <tbody>
              {!selectedGstin ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={8}>
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
                        <td className="px-3 py-2 align-top font-black text-navy-800">
                          {demandsForGroup(group).length ? (
                            <button
                              className="font-black text-sky-700 transition hover:text-sky-900 hover:underline"
                              onClick={(event) => {
                                event.stopPropagation();
                                showDemandBreakup(group);
                              }}
                              title="Show head-wise breakup"
                            >
                              {demandForGroup(group)}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
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
                          <td className="px-4 py-4" colSpan={8}>
                            <CaseDetail group={group} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={8}>
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
        )}
      </section>
    </div>
  );
}

// On-screen names for the stages, matching how the firm talks about them.
const stageDisplayNames: Record<CaseStage, string> = {
  Appeal: "Appeal",
  Application: "Application",
  Hearing: "Personal Hearing",
  Intimation: "Intimation",
  Order: "Order",
  Payment: "Payment",
  Rectification: "Rectification",
  Reply: "Reply",
  "Show Cause": "Show Cause Notice"
};

// The Case Map — a list like the cases table, one row per case. Clicking a
// row opens the stage timeline (Intimation, Show Cause Notice, Reply,
// Personal Hearing, Order…) plus the same case detail the cases view shows.
const demandHeadOrder = ["Integrated Tax", "Central Tax", "State/UT Tax", "Cess"];
const demandFieldOrder = ["Tax", "Interest", "Penalty", "Fee", "Others"];

function formatRupees(value: number | undefined) {
  if (value === undefined) {
    return "—";
  }
  return `₹${value.toLocaleString("en-IN")}`;
}

// The GST portal's own bifurcation, as a popup: tax heads down the side, the
// breakup (Tax / Interest / Penalty / Fee / Others) across, Total on the
// right. A head whose popup the collector never opened (zero or not
// clickable on the portal) shows its grid amount under Total and dashes for
// the breakup fields.
function DemandBreakupDialog({ caseId, demands, onClose }: { caseId: string; demands: DemandInfo[]; onClose: () => void }) {
  return (
    <div aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose} role="dialog">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Demand breakup</p>
            <h3 className="text-lg font-black text-navy-800">{caseId}</h3>
          </div>
          <button aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        {demands.map((demand) => {
          const heads = demandHeadOrder
            .filter((head) => demand.breakup[head])
            .concat(Object.keys(demand.breakup).filter((head) => !demandHeadOrder.includes(head)));
          return (
            <div className="mt-4" key={demand.demandId}>
              <p className="text-sm font-bold text-slate-700">
                Demand ID <span className="font-black text-navy-800">{demand.demandId}</span>
                {demand.date ? <span className="font-semibold text-slate-500"> · dated {demand.date}</span> : null}
              </p>
              <div className="mt-2 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-[11px] font-black uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2">Head</th>
                      {demandFieldOrder.map((field) => (
                        <th className="border-b border-slate-200 px-3 py-2 text-right" key={field}>
                          {field}
                        </th>
                      ))}
                      <th className="border-b border-slate-200 px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heads.length ? (
                      heads.map((head) => (
                        <tr className="border-b border-slate-100" key={head}>
                          <td className="px-3 py-2 font-bold text-slate-700">{head}</td>
                          {demandFieldOrder.map((field) => (
                            <td className="px-3 py-2 text-right font-semibold text-slate-600" key={field}>
                              {formatRupees(demand.breakup[head]?.[field])}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-black text-navy-800">{formatRupees(demand.breakup[head]?.Amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-500" colSpan={demandFieldOrder.length + 2}>
                          No head-wise figures were stored for this demand — run Get data once more to pull the bifurcation.
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="px-3 py-2 font-black text-navy-800">Total</td>
                      <td className="px-3 py-2" colSpan={demandFieldOrder.length} />
                      <td className="px-3 py-2 text-right font-black text-navy-800">{formatRupees(demand.amount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {demand.problems.length ? (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Check notes from the portal read: {demand.problems.join("; ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const caseMapColumns: { key: string; label: string }[] = [
  { key: "caseId", label: "Case ID" },
  { key: "category", label: "Category" },
  { key: "period", label: "Tax Period" },
  { key: "status", label: "Case Status" },
  { key: "chain", label: "Chain" },
  { key: "openClosed", label: "Open / Closed" },
  { key: "demand", label: "Demand Amount" }
];

function CaseMapList({ demandFor, groups, hasClient, isLoading, onShowDemand, rows }: { demandFor: (group: CaseGroup) => string; groups: CaseGroup[]; hasClient: boolean; isLoading: boolean; onShowDemand: (group: CaseGroup) => void; rows: CaseMapRow[] }) {
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [mapSort, setMapSort] = useState<GstSortState>(null);
  const [mapValueFilters, setMapValueFilters] = useState<Record<string, string[]>>({});
  const [mapTextFilters, setMapTextFilters] = useState<Record<string, string>>({});
  const mapMenu = useGstFilterMenu();

  const cellValue = (row: CaseMapRow, key: string): string => {
    switch (key) {
      case "caseId": return row.caseId;
      case "category": return row.category;
      case "period": return row.period;
      case "status": return row.status;
      case "chain": return row.chain.map((stage) => stageDisplayNames[stage]).join(" → ");
      case "openClosed": return row.open ? "Open" : "Closed";
      case "demand": {
        const group = groups.find((candidate) => candidate.caseId === row.caseId);
        return group ? demandFor(group) : "—";
      }
      default: return "";
    }
  };
  const matchesTextFilters = (row: CaseMapRow) =>
    caseMapColumns.every((column) => {
      const filter = (mapTextFilters[column.key] ?? "").trim().toLowerCase();
      return !filter || cellValue(row, column.key).toLowerCase().includes(filter);
    });
  const matchesValueFilters = (row: CaseMapRow, exceptKey?: string) =>
    Object.entries(mapValueFilters).every(([key, values]) => key === exceptKey || !values.length || values.includes(cellValue(row, key)));
  const visibleRows = rows
    .filter((row) => matchesTextFilters(row) && matchesValueFilters(row))
    .sort((a, b) => {
      if (!mapSort) {
        return 0;
      }
      const valueA = cellValue(a, mapSort.key);
      const valueB = cellValue(b, mapSort.key);
      // Blanks sink to the bottom in BOTH directions.
      if (isBlankCell(valueA) || isBlankCell(valueB)) {
        return isBlankCell(valueA) && isBlankCell(valueB) ? 0 : isBlankCell(valueA) ? 1 : -1;
      }
      const delta = compareCellValues(valueA, valueB);
      return mapSort.dir === "asc" ? delta : -delta;
    });
  const toggleMapSort = (key: string) =>
    setMapSort((current) => (!current || current.key !== key ? { dir: "asc", key } : current.dir === "asc" ? { dir: "desc", key } : null));
  const openMapFilter = (key: string, anchor: HTMLElement) => {
    const source = rows.filter((row) => matchesTextFilters(row) && matchesValueFilters(row, key));
    const options = [...new Set(source.map((row) => cellValue(row, key)))].sort(compareCellValues);
    mapMenu.open(key, anchor, options, mapValueFilters[key] ?? []);
  };
  const applyMapFilter = () => {
    const menu = mapMenu.menu;
    if (!menu) {
      return;
    }
    const selectedAll = menu.options.every((value) => mapMenu.draft.includes(value));
    setMapValueFilters((current) => ({ ...current, [menu.key]: selectedAll ? [] : menu.options.filter((value) => mapMenu.draft.includes(value)) }));
    mapMenu.close();
  };
  const clearMapFilter = () => {
    const menu = mapMenu.menu;
    if (menu) {
      setMapValueFilters((current) => ({ ...current, [menu.key]: [] }));
    }
    mapMenu.close();
  };

  return (
    <div className="overflow-auto rounded-lg border border-slate-200">
      {mapMenu.menu ? (
        <GstFilterMenu
          columnLabel={caseMapColumns.find((column) => column.key === mapMenu.menu?.key)?.label ?? ""}
          draft={mapMenu.draft}
          hasFilter={Boolean(mapValueFilters[mapMenu.menu.key]?.length)}
          menuPos={mapMenu.menu.menuPos}
          onApply={applyMapFilter}
          onCancel={mapMenu.close}
          onClear={clearMapFilter}
          onSearchChange={mapMenu.setSearch}
          onSortAsc={() => {
            setMapSort({ dir: "asc", key: mapMenu.menu?.key ?? "" });
            mapMenu.close();
          }}
          onSortDesc={() => {
            setMapSort({ dir: "desc", key: mapMenu.menu?.key ?? "" });
            mapMenu.close();
          }}
          onToggleAll={mapMenu.toggleAll}
          onToggleValue={mapMenu.toggleValue}
          search={mapMenu.search}
          visibleOptions={mapMenu.visibleOptions}
        />
      ) : null}
      <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
        <thead className="bg-slate-100 text-[11px] font-black uppercase tracking-wide text-slate-600">
          <tr>
            <th className="w-8 border-b border-slate-200 px-2 py-2" />
            {caseMapColumns.map((column) => (
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2" key={column.key}>
                <GstColumnHeader
                  hasFilter={Boolean(mapValueFilters[column.key]?.length)}
                  isAsc={mapSort?.key === column.key && mapSort.dir === "asc"}
                  isDesc={mapSort?.key === column.key && mapSort.dir === "desc"}
                  label={column.label}
                  onOpenFilter={(anchor) => openMapFilter(column.key, anchor)}
                  onToggleSort={() => toggleMapSort(column.key)}
                />
              </th>
            ))}
          </tr>
          <tr className="bg-white">
            <th className="border-b border-slate-200 px-1 py-1" />
            {caseMapColumns.map((column) => (
              <th className="border-b border-slate-200 px-1 py-1" key={column.key}>
                <FilterInput
                  onChange={(value) => setMapTextFilters((previous) => ({ ...previous, [column.key]: value }))}
                  value={mapTextFilters[column.key] ?? ""}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!hasClient ? (
            <tr>
              <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={8}>
                Select a client to see its case map.
              </td>
            </tr>
          ) : visibleRows.length ? (
            visibleRows.map((row) => {
              const isExpanded = expandedCaseId === row.caseId;
              const group = groups.find((candidate) => candidate.caseId === row.caseId);
              return (
                <Fragment key={row.caseId}>
                  <tr
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => setExpandedCaseId(isExpanded ? null : row.caseId)}
                  >
                    <td className="px-2 py-2 align-top text-slate-400">
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top font-bold text-navy-800">{row.caseId}</td>
                    <td className="px-3 py-2 align-top font-semibold text-slate-700">{row.category || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 align-top font-semibold text-slate-700">{row.period || "—"}</td>
                    <td className="px-3 py-2 align-top font-semibold text-slate-700">{row.status || "—"}</td>
                    <td className="px-3 py-2 align-top">
                      {row.chain.length ? (
                        <span className="flex flex-wrap items-center gap-1">
                          {row.chain.map((stage, index) => (
                            <Fragment key={stage}>
                              {index ? <span className="text-slate-400">→</span> : null}
                              <span className="inline-flex rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-black text-navy-700">
                                {stageDisplayNames[stage]}
                              </span>
                            </Fragment>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">(no dated stage)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${
                          row.open ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.open ? "Open" : "Closed"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top font-black text-navy-800">
                      {group && demandFor(group) !== "—" ? (
                        <button
                          className="font-black text-sky-700 transition hover:text-sky-900 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            onShowDemand(group);
                          }}
                          title="Show head-wise breakup"
                        >
                          {demandFor(group)}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td className="px-4 py-4" colSpan={8}>
                        <div className="space-y-4">
                          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-xs font-black uppercase tracking-wide text-navy-700">Stage timeline</p>
                            <div className="mt-3 flex flex-wrap items-start gap-y-3">
                              {row.chain.length ? (
                                row.chain.map((stage, index) => (
                                  <Fragment key={stage}>
                                    {index ? <span className="mx-2 mt-1 shrink-0 text-base font-black text-navy-200">→</span> : null}
                                    <div className="min-w-[110px] max-w-[220px]">
                                      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-navy-700">
                                        <span className="size-2 shrink-0 rounded-full border-2 border-navy-600 bg-white" />
                                        {stageDisplayNames[stage]}
                                      </p>
                                      {row.stages[stage] ? <p className="pl-3.5 text-[11px] font-bold text-slate-500">{row.stages[stage]}</p> : null}
                                      {row.refs.find((entry) => entry.stage === stage) ? (
                                        <p className="break-words pl-3.5 text-[10px] font-semibold text-slate-400">
                                          {row.refs.find((entry) => entry.stage === stage)?.refs.join(", ")}
                                        </p>
                                      ) : null}
                                    </div>
                                  </Fragment>
                                ))
                              ) : (
                                <p className="text-xs font-semibold text-slate-400">(no dated stage)</p>
                              )}
                            </div>
                            <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] font-bold text-slate-500">
                              {row.docs} doc{row.docs === 1 ? "" : "s"}
                              {row.latest ? ` · latest ${row.latest}` : ""}
                              {row.daysSince !== null ? ` · ${row.daysSince} day${row.daysSince === 1 ? "" : "s"} ago` : ""}
                            </p>
                            {row.folded.length ? (
                              <p className="mt-1 text-[11px] font-bold text-amber-700">
                                Appeal case{row.folded.length === 1 ? "" : "s"} {row.folded.join(", ")} folded into this case (filed against an order here).
                              </p>
                            ) : null}
                          </div>
                          {group ? <CaseMapProceedings group={group} /> : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          ) : (
            <tr>
              <td className="px-4 py-10 text-center text-sm font-bold text-slate-400" colSpan={8}>
                {isLoading ? "Loading…" : "No cases saved yet. Click Get data to pull them from the portal."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// A row often appears under two sub-tabs (an intimation is also listed under
// NOTICES); the Case Map shows one decisive stage per row instead of a pile
// of pills. Checked in order - the most advanced stage wins.
const proceedingStagePriority: [RegExp, string][] = [
  [/ORDER/, "Order"],
  [/RECTIF/, "Rectification"],
  [/REPL/, "Reply"],
  [/APPLICATION/, "Application"],
  [/ACK/, "Acknowledgement"],
  [/NOTICE/, "Notice"],
  [/INTIMATION/, "Intimation"]
];

function proceedingStage(tabList: string): string {
  const upper = tabList.toUpperCase();
  for (const [pattern, label] of proceedingStagePriority) {
    if (pattern.test(upper)) {
      return label;
    }
  }
  return tabList.split(",")[0]?.trim() || "—";
}

// The Case Map's streamlined proceedings: one stage pill per row, the columns
// that answer "what, which document, when, due by when", documents folded
// behind a count, rows in story order. The cases page keeps its full table.
function CaseMapProceedings({ group }: { group: CaseGroup }) {
  const combined = buildCombinedProceedings(group.tabs);
  const lower = combined.columns.map((column) => column.toLowerCase());
  const usable = (cell: string | undefined) => {
    const trimmed = (cell ?? "").trim();
    return trimmed && trimmed !== "—" && !/^-?na-?$/i.test(trimmed) ? trimmed : "";
  };

  // Each portal page names its columns differently (an appeal page says
  // "Date of Order" and "Type of Documents" where a notice page says "Issue
  // Date" and "Type"), so every field is found under ANY of its spellings,
  // in priority order, and whatever is left over shows as extra detail lines.
  const typePatterns = [/^type$/, /^type(?! of documents)/, /order category/, /notice type|form description/, /type of documents/, /description/];
  const datePatterns = [/issue date/, /date of order|order date/, /filed on|date of filing|date of application/, /^date$/];
  const duePatterns = [/due date/];
  const refPatterns = [/reference number/];
  const docPatterns = [/attach/, /view documents/, /^documents?$/];
  const noisePattern = /^s\.? ?no|^sr\.? ?no|serial/;

  const rows = combined.rows
    .map((row) => {
      const picked = new Set<number>();
      const pick = (patterns: RegExp[]) => {
        for (const pattern of patterns) {
          for (let index = 0; index < lower.length; index += 1) {
            if (!picked.has(index) && pattern.test(lower[index]) && usable(row.cells[index])) {
              picked.add(index);
              return usable(row.cells[index]);
            }
          }
        }
        return "";
      };
      const type = pick(typePatterns);
      const reference = pick(refPatterns);
      const date = pick(datePatterns);
      const due = pick(duePatterns);
      const docParts: string[] = [];
      lower.forEach((column, index) => {
        if (docPatterns.some((pattern) => pattern.test(column))) {
          const cell = usable(row.cells[index]);
          picked.add(index);
          if (cell) {
            docParts.push(cell);
          }
        }
      });
      const extras: { label: string; value: string }[] = [];
      combined.columns.forEach((column, index) => {
        if (picked.has(index) || noisePattern.test(lower[index])) {
          return;
        }
        const cell = usable(row.cells[index]);
        if (cell) {
          extras.push({ label: column, value: cell });
        }
      });
      return { attachments: docParts.join(" "), date, due, extras, reference, stage: proceedingStage(row.category), type };
    })
    .sort((a, b) => (parseAnyDate(a.date)?.getTime() ?? 0) - (parseAnyDate(b.date)?.getTime() ?? 0));

  if (!rows.length) {
    return <p className="text-xs font-semibold text-slate-400">No proceedings captured for this case yet.</p>;
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-navy-700 text-[10px] font-black uppercase tracking-wide text-white">
          <tr>
            <th className="whitespace-nowrap px-3 py-2">Stage</th>
            <th className="whitespace-nowrap px-3 py-2">Type</th>
            <th className="whitespace-nowrap px-3 py-2">Reference Number</th>
            <th className="whitespace-nowrap px-3 py-2">Date</th>
            <th className="whitespace-nowrap px-3 py-2">Due Date</th>
            <th className="whitespace-nowrap px-3 py-2">Documents</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className={`border-b border-slate-100 last:border-b-0 ${index % 2 ? "bg-slate-50/60" : "bg-white"}`} key={index}>
              <td className="whitespace-nowrap px-3 py-2 align-top">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${categoryPillClass(row.stage)}`}>
                  {row.stage}
                </span>
              </td>
              <td className="px-3 py-2 align-top font-semibold text-slate-700">
                {row.type || "—"}
                {row.extras.length ? (
                  <span className="mt-1 flex flex-col gap-0.5">
                    {row.extras.map((extra) => (
                      <span className="text-[10px] font-semibold text-slate-400" key={extra.label}>
                        <span className="font-bold text-slate-500">{extra.label}:</span> {extra.value}
                      </span>
                    ))}
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2 align-top font-semibold text-slate-700">{row.reference || "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 align-top font-semibold text-slate-700">{row.date || "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 align-top font-semibold text-slate-700">{row.due || "—"}</td>
              <td className="min-w-[200px] px-3 py-2 align-top">
                <CompactAttachments value={row.attachments} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Documents fold behind a count so a reply with seven annexures stays one
// row tall; opening the fold lists every file.
function CompactAttachments({ value }: { value: string }) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed.toLowerCase() === "-na-" || trimmed.toLowerCase() === "na") {
    return <span className="text-slate-400">—</span>;
  }
  const files = trimmed
    .split(/(?<=\.(?:pdf|png|jpe?g|xlsx?|docx?|zip))\s+/i)
    .map((file) => file.trim())
    .filter(Boolean);
  if (files.length === 1) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
        <FileText className="size-3 shrink-0 text-slate-400" />
        <span className="truncate" title={files[0]}>
          {files[0]}
        </span>
      </span>
    );
  }
  return (
    <details>
      <summary className="cursor-pointer select-none text-[11px] font-black text-navy-700 hover:underline">
        {files.length} files
      </summary>
      <span className="mt-1 flex flex-col gap-1">
        {files.map((file, index) => (
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600" key={index}>
            <FileText className="size-3 shrink-0 text-slate-400" />
            <span className="truncate" title={file}>
              {file}
            </span>
          </span>
        ))}
      </span>
    </details>
  );
}

function CaseDetail({ group }: { group: CaseGroup }) {
  const tabs = group.tabs;
  const sections = buildProceedingsByCategory(tabs);

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

      {sections.length ? (
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-wide text-navy-700">Case proceedings</p>
          {sections.map((section, sectionIndex) => (
            <div className="space-y-1.5" key={sectionIndex}>
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${categoryPillClass(section.category)}`}
              >
                {section.category}
              </span>
              {section.tables.map((table, tableIndex) => (
                <div className="overflow-auto rounded-lg border border-slate-200 shadow-sm" key={tableIndex}>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-navy-700 text-[10px] font-black uppercase tracking-wide text-white">
                      <tr>
                        {table.headers.map((header, headerIndex) => (
                          <th className="whitespace-nowrap px-3 py-2" key={headerIndex}>
                            {header || "—"}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, rowIndex) => (
                        <tr
                          className={`border-b border-slate-100 last:border-b-0 ${rowIndex % 2 ? "bg-slate-50/60" : "bg-white"}`}
                          key={rowIndex}
                        >
                          {table.headers.map((header, cellIndex) => (
                            <td className="px-3 py-2 align-top font-semibold text-slate-700" key={cellIndex}>
                              {/attachment|document/i.test(header) ? (
                                <AttachmentCell value={row[cellIndex] ?? ""} />
                              ) : (
                                (row[cellIndex] ?? "").trim() || "—"
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
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

// Keeps each sub-tab's own tables intact instead of forcing every column into
// one wide grid (which left most cells blank). Each section is a sub-tab, with
// its original tables, exact portal headers, blank/duplicate rows removed, and
// ragged rows padded so no captured cell is ever dropped.
function buildProceedingsByCategory(tabs: DetailTab[]): { category: string; tables: DetailTable[] }[] {
  const sections: { category: string; tables: DetailTable[] }[] = [];
  for (const tab of tabs) {
    const tables: DetailTable[] = [];
    for (const table of tab.tables) {
      const seen = new Set<string>();
      const rows: string[][] = [];
      for (const cells of table.rows) {
        const trimmed = cells.map((cell) => (cell ?? "").trim());
        if (!trimmed.some(Boolean)) {
          continue;
        }
        const key = trimmed.join("||");
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        rows.push(cells);
      }
      if (!rows.length) {
        continue;
      }
      const colCount = Math.max(table.headers.length, ...rows.map((row) => row.length));
      const headers = Array.from({ length: colCount }, (_, index) => (table.headers[index] ?? "").trim());
      tables.push({ headers, rows });
    }
    if (tables.length) {
      sections.push({ category: tab.name, tables });
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// TaskLine-style column controls: click a header to sort (asc → desc → off),
// or open its funnel menu for Sort A-Z / Z-A and an Excel-like checkbox list
// of the values that survive every OTHER active filter.

type GstSortState = { dir: "asc" | "desc"; key: string } | null;

function isBlankCell(value: string) {
  const trimmed = value.trim();
  return !trimmed || trimmed === "—";
}

// Numeric-aware compare: amounts ("₹1,29,56,348") and counts sort as numbers,
// dd-mm-yyyy dates sort as dates, text sorts alphabetically, blanks sink.
function compareCellValues(a: string, b: string) {
  if (isBlankCell(a) || isBlankCell(b)) {
    return isBlankCell(a) && isBlankCell(b) ? 0 : isBlankCell(a) ? 1 : -1;
  }
  const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  const dateA = a.trim().match(dmy);
  const dateB = b.trim().match(dmy);
  if (dateA && dateB) {
    const keyOf = (m: RegExpMatchArray) => `${m[3]}${m[2].padStart(2, "0")}${m[1].padStart(2, "0")}`;
    return keyOf(dateA).localeCompare(keyOf(dateB));
  }
  const numA = Number(a.replace(/[₹,\s]/g, ""));
  const numB = Number(b.replace(/[₹,\s]/g, ""));
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return numA - numB;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

type GstFilterMenuState = { key: string; menuPos: { left: number; maxHeight: number; top: number }; options: string[] };

function useGstFilterMenu() {
  const [menu, setMenu] = useState<GstFilterMenuState | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const open = (key: string, anchor: HTMLElement, options: string[], selected: string[]) => {
    const rect = anchor.getBoundingClientRect();
    const width = 320;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.bottom + 4;
    const maxHeight = Math.max(240, window.innerHeight - top - 16);
    setMenu({ key, menuPos: { left, maxHeight, top }, options });
    setDraft(selected.length ? [...selected] : [...options]);
    setSearch("");
  };
  const close = () => {
    setMenu(null);
    setDraft([]);
    setSearch("");
  };
  const visibleOptions = menu
    ? menu.options.filter((value) => !search.trim() || (value || "(Blank)").toLowerCase().includes(search.trim().toLowerCase()))
    : [];
  const toggleValue = (value: string) =>
    setDraft((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  const toggleAll = () =>
    setDraft((current) =>
      visibleOptions.every((value) => current.includes(value))
        ? current.filter((value) => !visibleOptions.includes(value))
        : [...new Set([...current, ...visibleOptions])]
    );

  return { close, draft, menu, open, search, setSearch, toggleAll, toggleValue, visibleOptions };
}

function GstColumnHeader({ hasFilter, isAsc, isDesc, label, onOpenFilter, onToggleSort }: {
  hasFilter: boolean;
  isAsc: boolean;
  isDesc: boolean;
  label: string;
  onOpenFilter: (anchor: HTMLElement) => void;
  onToggleSort: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left" onClick={onToggleSort} title={`Sort by ${label}`} type="button">
        <span className="min-w-0 whitespace-nowrap leading-tight">{label}</span>
        <span className="flex shrink-0 flex-col leading-none">
          <ArrowUp className={`size-3 ${isAsc ? "text-navy-700" : "text-slate-300"}`} />
          <ArrowDown className={`-mt-1 size-3 ${isDesc ? "text-navy-700" : "text-slate-300"}`} />
        </span>
      </button>
      <button
        aria-label={`Filter ${label}`}
        className={`inline-flex size-5 shrink-0 items-center justify-center rounded border transition ${
          hasFilter ? "border-navy-600 bg-navy-600 text-white" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100"
        }`}
        onClick={(event) => onOpenFilter(event.currentTarget)}
        title={`Filter ${label}`}
        type="button"
      >
        <Filter className="size-3" />
      </button>
    </div>
  );
}

function GstFilterMenu({ columnLabel, draft, hasFilter, menuPos, onApply, onCancel, onClear, onSearchChange, onSortAsc, onSortDesc, onToggleAll, onToggleValue, search, visibleOptions }: {
  columnLabel: string;
  draft: string[];
  hasFilter: boolean;
  menuPos: { left: number; maxHeight: number; top: number };
  onApply: () => void;
  onCancel: () => void;
  onClear: () => void;
  onSearchChange: (value: string) => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onToggleAll: () => void;
  onToggleValue: (value: string) => void;
  search: string;
  visibleOptions: string[];
}) {
  const { handleMenuKeyDown, highlight, setHighlight } = useFilterMenuKeys({
    itemCount: visibleOptions.length,
    onApply,
    onToggleIndex: (index) => onToggleValue(visibleOptions[index])
  });

  if (typeof document === "undefined") {
    return null;
  }

  const allVisibleSelected = visibleOptions.length > 0 && visibleOptions.every((value) => draft.includes(value));
  const someVisibleSelected = visibleOptions.some((value) => draft.includes(value)) && !allVisibleSelected;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[999]" onClick={onCancel} />
      <div
        className="fixed z-[1000] flex w-80 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-2 text-left normal-case tracking-normal text-slate-900 shadow-2xl"
        onKeyDown={handleMenuKeyDown}
        style={{ left: menuPos.left, maxHeight: menuPos.maxHeight, top: menuPos.top }}
      >
        <div className="shrink-0 space-y-1 border-b border-slate-200 pb-2">
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold transition hover:bg-slate-100" onClick={onSortAsc} type="button">
            <span className="flex w-8 items-center justify-center text-xs font-black text-navy-700">A-Z</span>
            Sort A to Z
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold transition hover:bg-slate-100" onClick={onSortDesc} type="button">
            <span className="flex w-8 items-center justify-center text-xs font-black text-navy-700">Z-A</span>
            Sort Z to A
          </button>
        </div>

        <button
          className="mt-2 flex w-full shrink-0 items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
          disabled={!hasFilter}
          onClick={onClear}
          type="button"
        >
          <X className="size-4" />
          Clear Filter From &quot;{columnLabel}&quot;
        </button>

        <div className="mt-2 flex shrink-0 justify-end gap-2">
          <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="inline-flex h-9 items-center justify-center rounded-md bg-navy-700 px-4 text-sm font-semibold text-white transition hover:bg-navy-800" onClick={onApply} type="button">
            OK
          </button>
        </div>

        <div className="mt-2 flex shrink-0 items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5">
          <Search className="size-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
            onChange={(event) => { setHighlight(-1); onSearchChange(event.target.value); }}
            placeholder="Search"
            value={search}
          />
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain border border-slate-200 bg-slate-50 p-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-950">
            <input
              checked={allVisibleSelected}
              className="size-4 accent-navy-700"
              onChange={onToggleAll}
              ref={(input) => {
                if (input) {
                  input.indeterminate = someVisibleSelected;
                }
              }}
              type="checkbox"
            />
            (Select All)
          </label>
          <div className="mt-1 space-y-1">
            {visibleOptions.length ? (
              visibleOptions.map((value, optionIndex) => (
                <label className={`flex cursor-pointer items-center gap-2 px-1 text-sm font-semibold text-slate-950${filterOptionHighlightClass(optionIndex === highlight)}`} data-filter-option={optionIndex} key={value || "(blank)"} onMouseEnter={() => setHighlight(optionIndex)}>
                  <input checked={draft.includes(value)} className="size-4 accent-navy-700" onChange={() => onToggleValue(value)} type="checkbox" />
                  <span className="min-w-0 truncate" title={value || "(Blank)"}>{value || "(Blank)"}</span>
                </label>
              ))
            ) : (
              <p className="py-6 text-center text-sm font-semibold text-slate-500">No values found</p>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
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
