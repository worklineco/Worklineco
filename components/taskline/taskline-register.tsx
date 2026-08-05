"use client";

import { ArrowDown, ArrowUp, Bookmark, CalendarDays, Check, ChevronDown, CircleDot, Download, Filter, History, ListChecks, Menu, Pencil, Pin, Plus, Search, Settings2, Trash2, Upload, Workflow, X } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx-js-style";
import { clearCached, getCached, setCached } from "@/lib/data-cache";

type TaskLineColumn = {
  key: string;
  label: string;
  type?: "date" | "money" | "number" | "select" | "text";
  width: number;
};
type TaskLineRow = Record<string, string>;
type TaskLineColumnLayout = { frozenColumnKeys: string[]; hiddenColumnKeys: string[]; order: string[] };
type TaskLineViewConfig = {
  activeColumnGroup?: string;
  columnFilters?: Record<string, string>;
  dueColorFilter?: string[];
  dueRange?: { end: string; preset: string; start: string };
  layout?: Partial<TaskLineColumnLayout>;
  search?: string;
  sortState?: { dir: "asc" | "desc"; key: string } | null;
  statusFilter?: string;
  valueFilters?: Record<string, string[]>;
};
type TaskLineSavedView = { config: TaskLineViewConfig; id: string; name: string };
type TaskLineAuditLog = {
  action: string;
  actorName?: string;
  createdAt: string;
  entityId?: string;
  field?: string;
  id: string;
  newValue?: string;
  oldValue?: string;
  rowLabel?: string;
};
type TaskLineView = "audit" | "register";

const importActionColumn = "Import Action";
const importActionOptions = ["Add", "Update", "Delete"];
const taskLineImportBatchSize = 250;
const taskLineImportConcurrency = 3;
const taskLinePageSize = 200;
const taskLineRowsCacheKey = "taskline:rows:v4";
const taskLineColumnGroups: { columns: string[] | null; key: string; label: string }[] = [
  { key: "core", label: "Core", columns: ["team", "task_code", "name", "resource", "entity_group", "entity", "state_name", "task", "due_date", "stage", "status_open_close", "remarks"] },
  { key: "legal", label: "Legal / Order", columns: ["task_code", "name", "entity", "task", "ref_date", "ref_no", "period", "section", "issue", "refer_other_task", "appeal_no", "order_type", "court_location", "engaged_counsel", "printing", "due_date", "stage"] },
  { key: "billing", label: "Billing / Fees", columns: ["task_code", "name", "entity", "task", "billable", "billing_status", "el_reference", "tax_invoice_no", "total_agreed_fee", "amount_raised", "amount_realised", "counsel_fee", "referral_fee", "fee_comments", "document_link"] },
  { key: "reminders", label: "Reminders / Status", columns: ["task_code", "name", "entity", "task", "realisation_status", "reminder_days", "reminder_email", "remaining_days", "status", "entry_date", "completion_date", "poc", "pending_from"] },
  { key: "all", label: "All", columns: null }
];
const taskLineColumnLayoutStorageKey = "workline:taskline-column-layout:v3";
const actionColumnWidth = 112;
const actionColumnKey = "__actions";
const taskLineColumns: TaskLineColumn[] = [
  { key: "team", label: "Team", width: 132 },
  { key: "task_code", label: "Task Code", width: 132 },
  { key: "name", label: "Name", width: 150 },
  { key: "resource", label: "Resource", width: 140 },
  { key: "entity_group", label: "Entity Group", width: 150 },
  { key: "entity", label: "Entity", width: 180 },
  { key: "state_name", label: "State Name", width: 130 },
  { key: "task", label: "Task", width: 210 },
  { key: "due_date", label: "Due Date", type: "date", width: 128 },
  { key: "stage", label: "Stage", width: 132 },
  { key: "status_open_close", label: "Status Open/Close", type: "select", width: 155 },
  { key: "billable", label: "Billable", type: "select", width: 108 },
  { key: "remarks", label: "Remarks", width: 200 },
  { key: "ref_date", label: "Order/SCN,etc. Ref. Date", type: "date", width: 180 },
  { key: "ref_no", label: "Order/SCN,etc. Ref. No", width: 180 },
  { key: "period", label: "Period", width: 140 },
  { key: "section", label: "Section (73/74/75)", width: 145 },
  { key: "issue", label: "Issue", width: 200 },
  { key: "refer_other_task", label: "Refer other Task", width: 170 },
  { key: "appeal_no", label: "Appeal No.", width: 150 },
  { key: "order_type", label: "Order Type", width: 150 },
  { key: "court_location", label: "Court Location", width: 170 },
  { key: "engaged_counsel", label: "Engaged Counsel", width: 180 },
  { key: "printing", label: "Printing", width: 120 },
  { key: "billing_status", label: "Billing Status", width: 160 },
  { key: "el_reference", label: "EL Reference No. and Document Link", width: 270 },
  { key: "tax_invoice_no", label: "Tax Invoice No.", width: 165 },
  { key: "realisation_status", label: "Realisation Status", width: 170 },
  { key: "reminder_days", label: "Reminder Days", type: "number", width: 150 },
  { key: "reminder_email", label: "Reminder Email", width: 210 },
  { key: "remaining_days", label: "Remaining Days", width: 150 },
  { key: "status", label: "Status", width: 130 },
  { key: "entry_date", label: "Entry Date", type: "date", width: 135 },
  { key: "completion_date", label: "Completion Date", type: "date", width: 160 },
  { key: "poc", label: "POC", width: 150 },
  { key: "pending_from", label: "Pending From", width: 160 },
  { key: "document_link", label: "Document Link", width: 220 },
  { key: "total_agreed_fee", label: "Total Agreed Fee", type: "money", width: 165 },
  { key: "amount_raised", label: "Amount Raised", type: "money", width: 150 },
  { key: "amount_realised", label: "Amount Realised", type: "money", width: 165 },
  { key: "counsel_fee", label: "Counsel Fee", type: "money", width: 145 },
  { key: "referral_fee", label: "Referral Fee", type: "money", width: 145 },
  { key: "fee_comments", label: "Fee Comments", width: 210 },
  { key: "any_other", label: "Any Other", width: 160 },
  { key: "any_other_1", label: "Any Other 1", width: 160 }
];

const taskLineColumnByKey = new Map(taskLineColumns.map((column) => [column.key, column]));
const defaultTaskLineColumnOrder = taskLineColumns.map((column) => column.key);
const statusOptions = ["Open", "Close"];
const billableOptions = ["Yes", "No"];
type TeamMemberLite = { designation: string; name: string; team: string };
type EntityMasterOption = { entity: string; group: string };
const emptyOptions: string[] = [];
const teamOptions = ["Team-02", "Team-03", "Team-04", "Team-05", "Team-06", "Team-08"];
const gstinStateOptions = [
  ["01", "Jammu and Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"],
  ["05", "Uttarakhand"], ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"],
  ["10", "Bihar"], ["11", "Sikkim"], ["12", "Arunachal Pradesh"], ["13", "Nagaland"], ["14", "Manipur"],
  ["15", "Mizoram"], ["16", "Tripura"], ["17", "Meghalaya"], ["18", "Assam"], ["19", "West Bengal"],
  ["20", "Jharkhand"], ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"], ["24", "Gujarat"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu"], ["27", "Maharashtra"], ["29", "Karnataka"], ["30", "Goa"],
  ["31", "Lakshadweep"], ["32", "Kerala"], ["33", "Tamil Nadu"], ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"], ["36", "Telangana"], ["37", "Andhra Pradesh"], ["38", "Ladakh"],
  ["97", "Other Territory"]
] as const;
const financialPeriodOptions = getFinancialPeriodOptions();

function teamMatchKey(value: string) {
  const digits = String(value ?? "").match(/\d+/);
  if (digits) {
    return String(parseInt(digits[0], 10));
  }
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isArticleDesignation(value: string) {
  return String(value ?? "").toLowerCase().includes("article");
}

function isPartnerDesignation(value: string) {
  return String(value ?? "").toLowerCase().includes("partner");
}
const defaultRows = Array.from({ length: 8 }, (_, index) => createEmptyRow(`initial-${index + 1}`));

export function TaskLineRegister() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortState, setSortState] = useState<{ dir: "asc" | "desc"; key: string } | null>(null);
  const [valueFilters, setValueFilters] = useState<Record<string, string[]>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState<string[]>([]);
  const [filterSearch, setFilterSearch] = useState("");
  const [openColumnOptions, setOpenColumnOptions] = useState<string[]>([]);
  const [isFilterOptionsLoading, setIsFilterOptionsLoading] = useState(false);
  const [filterMenuPos, setFilterMenuPos] = useState<{ left: number; maxHeight: number; top: number } | null>(null);
  const [dueColorFilter, setDueColorFilter] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState(() => getSavedTaskLineColumnLayout().order);
  const [auditLogs, setAuditLogs] = useState<TaskLineAuditLog[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [formDraft, setFormDraft] = useState<TaskLineRow | null>(null);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(() => new Set(getSavedTaskLineColumnLayout().hiddenColumnKeys));
  const [frozenColumnKeys, setFrozenColumnKeys] = useState<Set<string>>(() => new Set(getSavedTaskLineColumnLayout().frozenColumnKeys));
  const [isColumnOptionsOpen, setIsColumnOptionsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rows, setRows] = useState<TaskLineRow[]>([]);
  const [activeColumnGroup, setActiveColumnGroup] = useState("core");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dueRange, setDueRange] = useState<{ end: string; preset: string; start: string }>({ end: "", preset: "", start: "" });
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<TaskLineSavedView[]>([]);
  const [isViewsOpen, setIsViewsOpen] = useState(false);
  const [viewNameDraft, setViewNameDraft] = useState("");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [viewMode, setViewMode] = useState<TaskLineView>("register");
  const [taskMasters, setTaskMasters] = useState<{ id: string; name: string }[]>([]);
  const [isMasterOpen, setIsMasterOpen] = useState(false);
  const [isToolbarMenuOpen, setIsToolbarMenuOpen] = useState(false);
  const [masterMessage, setMasterMessage] = useState("");
  const taskMasterNames = useMemo(() => taskMasters.map((master) => master.name), [taskMasters]);
  const [stageMasters, setStageMasters] = useState<{ id: string; name: string }[]>([]);
  const [stageMasterMessage, setStageMasterMessage] = useState("");
  const [masterKind, setMasterKind] = useState<"stage" | "task">("task");
  const [isMasterSubmenuOpen, setIsMasterSubmenuOpen] = useState(false);
  const stageMasterNames = useMemo(() => stageMasters.map((master) => master.name), [stageMasters]);
  const [stageMastersFetched, setStageMastersFetched] = useState(false);
  const stageSeedDoneRef = useRef(false);
  const [teamMembers, setTeamMembers] = useState<TeamMemberLite[]>([]);
  const [entityMasters, setEntityMasters] = useState<EntityMasterOption[]>([]);
  const rowsRef = useRef<TaskLineRow[]>([]);
  const auditLoadedRef = useRef(false);
  const taskLineRequestIdRef = useRef(0);
  const fullRowsCacheRef = useRef<TaskLineRow[] | null>(null);
  const filterOptionsRequestIdRef = useRef(0);
  const queryEffectReadyRef = useRef(false);
  const taskMastersRequestedRef = useRef(false);
  const stageMastersRequestedRef = useRef(false);
  const teamMembersRequestedRef = useRef(false);
  const entityMastersRequestedRef = useRef(false);
  const entityGroupByName = useMemo(
    () => new Map(entityMasters.map((option) => [normalizeOptionKey(option.entity), option.group])),
    [entityMasters]
  );
  const entityOptions = useMemo(() => entityMasters.map((option) => option.entity), [entityMasters]);
  const sectionOptions = useMemo(() => uniqueSortedValues(rows.map((row) => row.section)), [rows]);
  const teamNameOptions = useMemo(() => {
    const partners = teamMembers
      .filter((member) => isPartnerDesignation(member.designation))
      .map((member) => member.name.trim())
      .filter(Boolean);
    const byTeam = new Map<string, string[]>();
    for (const member of teamMembers) {
      if (isArticleDesignation(member.designation)) {
        continue;
      }
      const key = teamMatchKey(member.team);
      const list = byTeam.get(key) ?? [];
      list.push(member.name.trim());
      byTeam.set(key, list);
    }
    const map = new Map<string, string[]>();
    for (const [key, names] of byTeam) {
      map.set(key, Array.from(new Set([...names, ...partners].filter(Boolean))));
    }
    return { map, partnersOnly: Array.from(new Set(partners)) };
  }, [teamMembers]);
  const teamResourceOptions = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const member of teamMembers) {
      if (!isArticleDesignation(member.designation)) {
        continue;
      }
      const key = teamMatchKey(member.team);
      const list = map.get(key) ?? [];
      list.push(member.name.trim());
      map.set(key, list);
    }
    for (const [key, names] of map) {
      map.set(key, Array.from(new Set(names.filter(Boolean))));
    }
    return map;
  }, [teamMembers]);
  const nameOptionsForTeam = useCallback(
    (team: string) => teamNameOptions.map.get(teamMatchKey(team)) ?? teamNameOptions.partnersOnly,
    [teamNameOptions]
  );
  const resourceOptionsForTeam = useCallback(
    (team: string) => teamResourceOptions.get(teamMatchKey(team)) ?? emptyOptions,
    [teamResourceOptions]
  );

  const orderedColumns = useMemo(
    () => columnOrder.map((key) => taskLineColumnByKey.get(key)).filter((column): column is TaskLineColumn => Boolean(column)),
    [columnOrder]
  );
  const activeGroupColumnSet = useMemo(() => {
    const group = taskLineColumnGroups.find((item) => item.key === activeColumnGroup);
    return group?.columns ? new Set(group.columns) : null;
  }, [activeColumnGroup]);
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !hiddenColumnKeys.has(column.key) && (!activeGroupColumnSet || activeGroupColumnSet.has(column.key))),
    [activeGroupColumnSet, hiddenColumnKeys, orderedColumns]
  );
  const actionColumnHidden = hiddenColumnKeys.has(actionColumnKey);
  const actionColumnFrozen = frozenColumnKeys.has(actionColumnKey);
  const tableWidth = useMemo(() => (actionColumnHidden ? 0 : actionColumnWidth) + visibleColumns.reduce((total, column) => total + column.width, 0), [actionColumnHidden, visibleColumns]);
  const frozenLefts = useMemo(() => {
    const lefts = new Map<string, number>();
    let acc = actionColumnFrozen && !actionColumnHidden ? actionColumnWidth : 0;
    for (const column of visibleColumns) {
      if (frozenColumnKeys.has(column.key)) {
        lefts.set(column.key, acc);
        acc += column.width;
      }
    }
    return lefts;
  }, [actionColumnFrozen, actionColumnHidden, frozenColumnKeys, visibleColumns]);

  function frozenInfo(key: string) {
    return { isFrozen: frozenColumnKeys.has(key), left: frozenLefts.get(key) ?? 0 };
  }
  const filteredRows = useMemo(
    () => applyTaskLineFilters(rows, { columnFilters, dueColorFilter, dueRange, search, sortState, statusFilter, valueFilters }),
    [rows, columnFilters, dueColorFilter, dueRange, search, sortState, statusFilter, valueFilters]
  );
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim());
  const hasActiveDataQuery = Boolean(
    search.trim() ||
    statusFilter ||
    sortState ||
    hasActiveColumnFilters ||
    dueColorFilter.length ||
    dueRange.preset ||
    Object.values(valueFilters).some((values) => values.length)
  );
  const taskLineQueryString = useMemo(
    () => buildTaskLineQueryString(visibleColumns, {
      columnFilters,
      dueColorFilter,
      search,
      sortState,
      statusFilter,
      valueFilters
    }) + "|due:" + JSON.stringify(dueRange),
    [columnFilters, dueColorFilter, dueRange, search, sortState, statusFilter, valueFilters, visibleColumns]
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / taskLinePageSize));
  const pagedRows = useMemo(() => {
    const startIndex = (tablePage - 1) * taskLinePageSize;
    return filteredRows.slice(startIndex, startIndex + taskLinePageSize);
  }, [filteredRows, tablePage]);

  useEffect(() => {
    void loadAllTaskLine();
    void loadViews();
  }, []);

  useEffect(() => {
    if (!queryEffectReadyRef.current) {
      queryEffectReadyRef.current = true;
      return;
    }

    setTablePage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskLineQueryString]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    if (stageSeedDoneRef.current || !stageMastersFetched || !rows.length) {
      return;
    }
    stageSeedDoneRef.current = true;
    if (stageMasters.length) {
      return;
    }
    const unique = Array.from(new Set(rows.map((row) => text(row.stage).trim()).filter(Boolean)));
    if (unique.length) {
      void seedStageMasters(unique);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, stageMasters, stageMastersFetched]);

  useEffect(() => {
    const nextPage = Math.min(tablePage, pageCount);
    if (nextPage !== tablePage) {
      setTablePage(nextPage);
    }
  }, [pageCount, tablePage]);

  const visibleFilterOptions = useMemo(() => {
    const query = filterSearch.trim().toLowerCase();
    return query ? openColumnOptions.filter((value) => value.toLowerCase().includes(query)) : openColumnOptions;
  }, [openColumnOptions, filterSearch]);

  function openColumnFilter(key: string, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    const width = 288;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.bottom + 4;
    const maxHeight = Math.max(240, window.innerHeight - top - 16);
    const options = uniqueSortedValues(rowsRef.current.map((row) => text(row[key])), true);

    setOpenFilterKey(key);
    setFilterSearch("");
    setFilterMenuPos({ left, maxHeight, top });
    setOpenColumnOptions(options);
    setFilterDraft(valueFilters[key] ? [...valueFilters[key]] : options);
    setIsFilterOptionsLoading(false);
  }

  const closeColumnFilter = useCallback(() => {
    filterOptionsRequestIdRef.current += 1;
    setOpenFilterKey(null);
    setOpenColumnOptions([]);
    setIsFilterOptionsLoading(false);
    setFilterMenuPos(null);
  }, []);

  useEffect(() => {
    if (!openFilterKey) {
      return;
    }

    function handleFilterKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeColumnFilter();
      }
    }

    function handleFilterPointerDown(event: PointerEvent) {
      const target = event.target;

      if (target instanceof Element && target.closest('[data-taskline-filter-menu="true"]')) {
        return;
      }

      closeColumnFilter();
    }

    document.addEventListener("keydown", handleFilterKeyDown);
    document.addEventListener("pointerdown", handleFilterPointerDown);

    return () => {
      document.removeEventListener("keydown", handleFilterKeyDown);
      document.removeEventListener("pointerdown", handleFilterPointerDown);
    };
  }, [closeColumnFilter, openFilterKey]);

  function applyColumnFilter(key: string) {
    setValueFilters((current) => {
      const next = { ...current };
      if (filterDraft.length >= openColumnOptions.length) {
        delete next[key];
      } else {
        next[key] = [...filterDraft];
      }
      return next;
    });
    closeColumnFilter();
  }

  function clearColumnFilter(key: string) {
    setValueFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    closeColumnFilter();
  }

  function toggleDraftValue(value: string) {
    setFilterDraft((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  function toggleVisibleDraftValues() {
    const allSelected = visibleFilterOptions.every((value) => filterDraft.includes(value));
    setFilterDraft((current) => {
      if (allSelected) {
        return current.filter((value) => !visibleFilterOptions.includes(value));
      }
      const merged = new Set(current);
      for (const value of visibleFilterOptions) {
        merged.add(value);
      }
      return Array.from(merged);
    });
  }

  function toggleDueColor(key: string) {
    setDueColorFilter((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function toggleSort(key: string) {
    setSortState((current) => {
      if (!current || current.key !== key) {
        return { dir: "asc", key };
      }
      if (current.dir === "asc") {
        return { dir: "desc", key };
      }
      return null;
    });
  }

  async function loadMasters() {
    if (taskMastersRequestedRef.current) return;
    taskMastersRequestedRef.current = true;
    try {
      const response = await fetch("/api/taskline/masters", { cache: "no-store" });
      const result = (await response.json()) as { error?: string; masters?: { id: string; name: string }[] };
      if (!response.ok) {
        taskMastersRequestedRef.current = false;
        setMasterMessage(result.error ?? "Could not load task master list.");
        return;
      }
      setTaskMasters(result.masters ?? []);
      setMasterMessage("");
    } catch {
      taskMastersRequestedRef.current = false;
      setMasterMessage("Could not load task master list.");
    }
  }

  async function saveTaskMaster(name: string, id?: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const response = await fetch("/api/taskline/masters", {
      body: JSON.stringify({ id, name: trimmed }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { error?: string; masters?: { id: string; name: string }[] };
    if (!response.ok) {
      setMasterMessage(result.error ?? "Could not save task type.");
      return;
    }
    setTaskMasters(result.masters ?? []);
    setMasterMessage("");
  }

  async function deleteTaskMaster(id: string) {
    const response = await fetch(`/api/taskline/masters?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string; masters?: { id: string; name: string }[] };
    if (!response.ok) {
      setMasterMessage(result.error ?? "Could not delete task type.");
      return;
    }
    setTaskMasters(result.masters ?? []);
    setMasterMessage("");
  }

  async function loadStageMasters() {
    if (stageMastersRequestedRef.current) return;
    stageMastersRequestedRef.current = true;
    try {
      const response = await fetch("/api/taskline/masters?type=stage", { cache: "no-store" });
      const result = (await response.json()) as { error?: string; masters?: { id: string; name: string }[] };
      if (!response.ok) {
        stageMastersRequestedRef.current = false;
        setStageMasterMessage(result.error ?? "Could not load stage master list.");
        return;
      }
      setStageMasters(result.masters ?? []);
      setStageMasterMessage("");
    } catch {
      stageMastersRequestedRef.current = false;
      setStageMasterMessage("Could not load stage master list.");
    } finally {
      setStageMastersFetched(true);
    }
  }

  async function seedStageMasters(names: string[]) {
    const response = await fetch("/api/taskline/masters", {
      body: JSON.stringify({ names, type: "stage" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { error?: string; masters?: { id: string; name: string }[] };
    if (response.ok) {
      setStageMasters(result.masters ?? []);
      setStageMasterMessage("");
    }
  }

  async function saveStageMaster(name: string, id?: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const response = await fetch("/api/taskline/masters", {
      body: JSON.stringify({ id, name: trimmed, type: "stage" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { error?: string; masters?: { id: string; name: string }[] };
    if (!response.ok) {
      setStageMasterMessage(result.error ?? "Could not save stage type.");
      return;
    }
    setStageMasters(result.masters ?? []);
    setStageMasterMessage("");
  }

  async function deleteStageMaster(id: string) {
    const response = await fetch(`/api/taskline/masters?type=stage&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string; masters?: { id: string; name: string }[] };
    if (!response.ok) {
      setStageMasterMessage(result.error ?? "Could not delete stage type.");
      return;
    }
    setStageMasters(result.masters ?? []);
    setStageMasterMessage("");
  }

  async function loadTeamMembers() {
    if (teamMembersRequestedRef.current) return;
    teamMembersRequestedRef.current = true;
    try {
      const response = await fetch("/api/teams", { cache: "no-store" });
      const result = (await response.json()) as { members?: { designation?: string; name?: string; team?: string }[] };
      if (!response.ok) {
        teamMembersRequestedRef.current = false;
        return;
      }
      setTeamMembers(
        (result.members ?? []).map((member) => ({
          designation: text(member.designation),
          name: text(member.name),
          team: text(member.team)
        }))
      );
    } catch {
      teamMembersRequestedRef.current = false;
      // ignore; Name/Resource dropdowns fall back to any existing value
    }
  }

  async function loadEntityMasters() {
    if (entityMastersRequestedRef.current) return;
    entityMastersRequestedRef.current = true;
    try {
      const response = await fetch("/api/client-records/managed", { cache: "no-store" });
      const result = (await response.json()) as { rows?: Array<Record<string, unknown>> };
      if (!response.ok) {
        entityMastersRequestedRef.current = false;
        return;
      }

      const optionsByName = new Map<string, EntityMasterOption>();
      for (const row of result.rows ?? []) {
        const entity = text(row.Particulars);
        if (!entity) continue;
        const key = normalizeOptionKey(entity);
        const group = text(row.Group);
        const existing = optionsByName.get(key);
        if (!existing || (!existing.group && group)) {
          optionsByName.set(key, { entity: existing?.entity ?? entity, group });
        }
      }
      setEntityMasters(Array.from(optionsByName.values()).sort((a, b) => a.entity.localeCompare(b.entity, undefined, { numeric: true })));
    } catch {
      entityMastersRequestedRef.current = false;
      // Existing values remain visible if the client master is temporarily unavailable.
    }
  }

  function loadDropdownOptions(columnKey: string) {
    if (columnKey === "entity") {
      void loadEntityMasters();
    } else if (columnKey === "name" || columnKey === "resource") {
      void loadTeamMembers();
    } else if (columnKey === "task") {
      void loadMasters();
    } else if (columnKey === "stage") {
      void loadStageMasters();
    }
  }

  function loadEditorOptions() {
    void Promise.all([loadMasters(), loadStageMasters(), loadTeamMembers(), loadEntityMasters()]);
  }

  async function loadViews() {
    try {
      const response = await fetch("/api/taskline/views");
      const result = (await response.json().catch(() => ({}))) as { error?: string; views?: TaskLineSavedView[] };
      if (!response.ok) {
        if (result.error) setMessage(result.error);
        return;
      }
      setSavedViews(result.views ?? []);
    } catch {
      // saved views are non-critical; ignore load failures
    }
  }

  function captureViewConfig(): TaskLineViewConfig {
    return {
      activeColumnGroup,
      columnFilters,
      dueColorFilter,
      dueRange,
      layout: { frozenColumnKeys: [...frozenColumnKeys], hiddenColumnKeys: [...hiddenColumnKeys], order: columnOrder },
      search,
      sortState,
      statusFilter,
      valueFilters
    };
  }

  function applyViewConfig(config: TaskLineViewConfig) {
    setColumnFilters(config.columnFilters ?? {});
    setValueFilters(config.valueFilters ?? {});
    setDueColorFilter(config.dueColorFilter ?? []);
    setDueRange(config.dueRange ?? { end: "", preset: "", start: "" });
    setStatusFilter(config.statusFilter ?? "");
    setSearch(config.search ?? "");
    setSortState(config.sortState ?? null);
    if (config.activeColumnGroup) setActiveColumnGroup(config.activeColumnGroup);
    if (config.layout) {
      const normalized = normalizeTaskLineColumnLayout(config.layout);
      setColumnOrder(normalized.order);
      setHiddenColumnKeys(new Set(normalized.hiddenColumnKeys));
      setFrozenColumnKeys(new Set(normalized.frozenColumnKeys));
      saveTaskLineColumnLayout(normalized);
    }
    setTablePage(1);
  }

  async function saveView(name: string, id?: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setMessage(id ? "Updating view..." : "Saving view...");
    try {
      const response = await fetch("/api/taskline/views", {
        body: JSON.stringify({ config: captureViewConfig(), id: id ?? undefined, name: trimmed }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; views?: TaskLineSavedView[] };
      if (!response.ok) {
        setMessage(result.error ?? "Could not save the view.");
        return;
      }
      setSavedViews(result.views ?? []);
      const saved = (result.views ?? []).find((view) => view.name === trimmed);
      if (saved) setActiveViewId(saved.id);
      setViewNameDraft("");
      setMessage(id ? "View updated." : `View "${trimmed}" saved.`);
    } catch {
      setMessage("Could not save the view.");
    }
  }

  function applyView(view: TaskLineSavedView) {
    applyViewConfig(view.config ?? {});
    setActiveViewId(view.id);
    setIsViewsOpen(false);
    setMessage(`Showing view "${view.name}".`);
  }

  async function deleteView(view: TaskLineSavedView) {
    if (!window.confirm(`Delete the view "${view.name}"?`)) return;
    try {
      const response = await fetch(`/api/taskline/views?id=${encodeURIComponent(view.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string; views?: TaskLineSavedView[] };
      if (!response.ok) {
        setMessage(result.error ?? "Could not delete the view.");
        return;
      }
      setSavedViews(result.views ?? []);
      if (activeViewId === view.id) setActiveViewId(null);
      setMessage(`View "${view.name}" deleted.`);
    } catch {
      setMessage("Could not delete the view.");
    }
  }

  async function renameView(view: TaskLineSavedView) {
    const next = window.prompt("Rename view", view.name)?.trim();
    if (!next || next === view.name) return;
    setMessage("Renaming view...");
    try {
      const response = await fetch("/api/taskline/views", {
        body: JSON.stringify({ config: view.config ?? {}, id: view.id, name: next }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; views?: TaskLineSavedView[] };
      if (!response.ok) {
        setMessage(result.error ?? "Could not rename the view.");
        return;
      }
      setSavedViews(result.views ?? []);
      setMessage("View renamed.");
    } catch {
      setMessage("Could not rename the view.");
    }
  }

  async function loadAllTaskLine(useCache = true) {
    const requestId = ++taskLineRequestIdRef.current;
    const cached = useCache ? getCached<{ rows?: TaskLineRow[] }>(taskLineRowsCacheKey) : undefined;

    if (cached?.rows?.length) {
      setRows(cached.rows);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await fetch("/api/taskline", { cache: "no-store" });
      const result = (await response.json()) as { error?: string; rows?: TaskLineRow[] };

      if (!response.ok) {
        if (requestId === taskLineRequestIdRef.current) {
          setMessage(result.error ?? "Could not load TaskLine.");
        }
        return cached?.rows ?? [];
      }

      if (requestId !== taskLineRequestIdRef.current) {
        return result.rows ?? [];
      }

      const nextRows = result.rows ?? [];
      setCached(taskLineRowsCacheKey, { rows: nextRows });
      setRows(nextRows);
      setMessage("");
      return nextRows;
    } catch (error) {
      console.error("TaskLine load error:", error);
      if (requestId === taskLineRequestIdRef.current) {
        setMessage("Could not load TaskLine.");
      }
      return cached?.rows ?? [];
    } finally {
      if (requestId === taskLineRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }

  async function reloadTaskLine() {
    clearCached(taskLineRowsCacheKey);
    return loadAllTaskLine(false);
  }

  function goToPage(nextPage: number) {
    setTablePage(Math.max(1, Math.min(pageCount, nextPage)));
  }

  async function showAuditTrail(selectedRow?: TaskLineRow) {
    setViewMode("audit");
    if (selectedRow) {
      setMessage(`Showing audit trail. Row selected: ${getRowLabel(selectedRow, rows) || "TaskLine row"}.`);
    }
    if (auditLoadedRef.current || isAuditLoading) return;

    setIsAuditLoading(true);
    try {
      const response = await fetch("/api/taskline?view=audit", { cache: "no-store" });
      const result = (await response.json()) as { auditLogs?: Array<Record<string, unknown>>; error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not load TaskLine audit trail.");
        return;
      }
      setAuditLogs((result.auditLogs ?? []).map(formatServerAuditLog));
      auditLoadedRef.current = true;
    } catch (error) {
      console.error("TaskLine audit load error:", error);
      setMessage("Could not load TaskLine audit trail.");
    } finally {
      setIsAuditLoading(false);
    }
  }

  function addRow() {
    loadEditorOptions();
    setEditingRowId(null);
    setFormDraft(createEmptyRow(`draft-${crypto.randomUUID()}`));
  }

  function openEditForm(row: TaskLineRow) {
    loadEditorOptions();
    setEditingRowId(row.__id);
    setFormDraft({ ...row });
  }

  function updateFormDraft(key: string, value: string) {
    setFormDraft((current) => {
      if (!current) return current;
      if (key !== "entity") return { ...current, [key]: value };

      const group = entityGroupByName.get(normalizeOptionKey(value)) ?? "";
      setMessage(value && !group ? `No Entity Group mapping found for "${value}".` : "");
      return { ...current, entity: value, entity_group: group };
    });
  }

  async function saveFormDraft() {
    if (!formDraft) {
      return;
    }

    const existingRow = editingRowId ? rows.find((row) => row.__id === editingRowId) : null;
    setMessage(editingRowId ? "Saving TaskLine row..." : "Creating TaskLine row...");

    try {
      const response = await fetch("/api/taskline", {
        body: JSON.stringify({ action: "save", record: formDraft }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { error?: string; record?: TaskLineRow };

      if (!response.ok || !result.record) {
        setMessage(result.error ?? "Could not save TaskLine row.");
        return;
      }

      if (editingRowId) {
        setRows((current) => current.map((row) => (row.__id === editingRowId ? result.record! : row)));
        setMessage("TaskLine row updated.");
      } else {
        setRows((current) => [result.record!, ...current]);
        setMessage("TaskLine row added.");
      }

    } catch (error) {
      console.error("TaskLine save error:", error);
      setMessage("Could not save TaskLine row.");
      return;
    }

    if (editingRowId) {
      addAuditLog({
        action: "taskline.edit_row",
        entityId: existingRow?.__id,
        newValue: getChangedFields(existingRow ?? undefined, formDraft).join(", ") || "Row saved",
        rowLabel: getRowLabel(existingRow ?? undefined, rows)
      });
    } else {
      addAuditLog({ action: "taskline.add_row", newValue: getRowLabel(formDraft, [formDraft]) || "New row added" });
    }

    setEditingRowId(null);
    setFormDraft(null);
  }

  const updateRow = useCallback((rowId: string, key: string, value: string) => {
    const currentRows = rowsRef.current;
    const existing = currentRows.find((item) => item.__id === rowId);
    const oldValue = existing?.[key] ?? "";

    if (existing && oldValue !== value) {
      addAuditLog({
        action: "taskline.update_cell",
        entityId: rowId,
        field: taskLineColumnByKey.get(key)?.label ?? key,
        newValue: value,
        oldValue,
        rowLabel: getRowLabel(existing, currentRows)
      });
    }

    const changes: Record<string, string> = { [key]: value };
    if (key === "entity") {
      const group = entityGroupByName.get(normalizeOptionKey(value)) ?? "";
      changes.entity_group = group;
      setMessage(value && !group ? `No Entity Group mapping found for "${value}".` : "");
    }

    const nextRow = existing ? { ...existing, ...changes } : null;
    setRows((current) => current.map((item) => (item.__id === rowId ? { ...item, ...changes } : item)));
    if (nextRow) {
      void saveInlineRow(nextRow);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityGroupByName]);

  async function saveInlineRow(row: TaskLineRow) {
    try {
      await fetch("/api/taskline", {
        body: JSON.stringify({ action: "save", record: row }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
    } catch (error) {
      console.error("TaskLine inline save error:", error);
    }
  }


  function viewRowHistory(row: TaskLineRow) {
    void showAuditTrail(row);
  }

  function downloadTemplate() {
    const templateRow = taskLineColumns.reduce<Record<string, string>>(
      (row, column) => {
        row[column.label] = "";
        return row;
      },
      { [importActionColumn]: "Add" }
    );
    const worksheet = XLSX.utils.json_to_sheet([templateRow], { header: [importActionColumn, ...taskLineColumns.map((column) => column.label)] });
    worksheet["!cols"] = [importActionColumn, ...taskLineColumns.map((column) => column.label)].map(() => ({ wch: 22 }));
    addImportActionDropdown(worksheet, 500);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "TaskLine Import");
    XLSX.writeFile(workbook, "workline-taskline-import-template.xlsx");
    addAuditLog({ action: "taskline.download_template", newValue: "Downloaded import template" });
  }

  async function exportView() {
    setMessage("Preparing TaskLine export...");
    let sourceRows = rows;

    if (fullRowsCacheRef.current) {
      sourceRows = fullRowsCacheRef.current;
    } else {
      try {
        const response = await fetch("/api/taskline?all=1", { cache: "no-store" });
        const result = (await response.json()) as { error?: string; rows?: TaskLineRow[] };
        if (!response.ok) {
          setMessage(result.error ?? "Could not prepare TaskLine export.");
          return;
        }
        sourceRows = result.rows ?? [];
        fullRowsCacheRef.current = sourceRows;
      } catch {
        setMessage("Could not prepare TaskLine export.");
        return;
      }
    }

    const exportSourceRows = filterAndSortTaskLineRows(sourceRows, visibleColumns, {
      columnFilters,
      dueColorFilter,
      search,
      sortState,
      statusFilter,
      valueFilters
    });
    const exportRows = exportSourceRows.map((row, index) =>
      taskLineColumns.reduce<Record<string, string | number>>(
        (result, column) => {
          result[column.label] = column.key === "serial_no" ? index + 1 : row[column.key] ?? "";
          return result;
        },
        { [importActionColumn]: "Update" }
      )
    );
    const worksheet = XLSX.utils.json_to_sheet(exportRows.length ? exportRows : [blankExportRow()], {
      header: [importActionColumn, ...taskLineColumns.map((column) => column.label)]
    });
    worksheet["!cols"] = [importActionColumn, ...taskLineColumns.map((column) => column.label)].map(() => ({ wch: 22 }));
    addImportActionDropdown(worksheet, Math.max(exportRows.length + 100, 500));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "TaskLine");
    XLSX.writeFile(workbook, "workline-taskline-current-view.xlsx");
    addAuditLog({ action: "taskline.export_view", newValue: `${exportRows.length} rows exported` });
    setMessage(`Exported ${exportRows.length} TaskLine rows.`);
  }

  async function importWorkbook(file: File) {
    setMessage(`Importing ${file.name}...`);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!sheet) {
        setMessage(`No worksheet found in ${file.name}.`);
        return;
      }

      const importedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      if (!importedRows.length) {
        setMessage(`No TaskLine rows found in ${file.name}.`);
        return;
      }

      const needsImportTargets = importedRows.some((rawRow) =>
        ["update", "delete"].includes(text(rawRow[importActionColumn] || "Add").toLowerCase())
      );
      let importTargetRows = rows;

      if (needsImportTargets) {
        let completeRows = fullRowsCacheRef.current;
        if (!completeRows) {
          setMessage(`Resolving TaskLine rows before importing ${file.name}...`);
          const response = await fetch("/api/taskline?all=1", { cache: "no-store" });
          const result = (await response.json()) as { error?: string; rows?: TaskLineRow[] };
          if (!response.ok) {
            setMessage(result.error ?? "Could not resolve TaskLine rows for this import.");
            return;
          }
          completeRows = result.rows ?? [];
          fullRowsCacheRef.current = completeRows;
        }
        importTargetRows = filterAndSortTaskLineRows(completeRows, visibleColumns, {
          columnFilters,
          dueColorFilter,
          search,
          sortState,
          statusFilter,
          valueFilters
        });
      }

      const importRows = importedRows
        .map((rawRow) => {
          const importAction = text(rawRow[importActionColumn] || "Add");
          const serialNumber = text(rawRow["S. No."] || rawRow["S.No."] || rawRow["Serial No."]);
          const serialIndex = Number.parseInt(serialNumber, 10) - 1;
          const targetId = importAction.toLowerCase() === "add" || !Number.isInteger(serialIndex) || serialIndex < 0
            ? ""
            : text(importTargetRows[serialIndex]?.__id);
          return {
            ...rowFromImport(rawRow),
            import_action: importAction,
            serial_no: serialNumber,
            target_id: targetId
          };
        })
        .filter(hasTaskLineValue);

      if (!importRows.length) {
        setMessage(`No filled TaskLine rows found in ${file.name}. Please enter data below the headers before importing.`);
        return;
      }

      const summary = { added: 0, deleted: 0, updated: 0 };

      const batches = Array.from({ length: Math.ceil(importRows.length / taskLineImportBatchSize) }, (_, index) =>
        importRows.slice(index * taskLineImportBatchSize, (index + 1) * taskLineImportBatchSize)
      );
      let processed = 0;

      for (let index = 0; index < batches.length; index += taskLineImportConcurrency) {
        const batchGroup = batches.slice(index, index + taskLineImportConcurrency);
        const results = await Promise.all(batchGroup.map(postTaskLineImportBatch));
        for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
          const result = results[resultIndex];
          summary.added += result.summary?.added ?? 0;
          summary.updated += result.summary?.updated ?? 0;
          summary.deleted += result.summary?.deleted ?? 0;
          processed += batchGroup[resultIndex].length;
        }
        setMessage(`Importing ${file.name}: ${processed} of ${importRows.length} rows processed...`);
      }

      setMessage(`Imported ${file.name}: ${summary.added} added, ${summary.updated} updated, ${summary.deleted} deleted.`);
      await reloadTaskLine();
    } catch (error) {
      console.error("TaskLine import error:", error);
      setMessage(error instanceof Error ? error.message : "Could not import TaskLine rows. Please check the file and try again.");
    }
  }

  function addAuditLog(log: Omit<TaskLineAuditLog, "createdAt" | "id">) {
    setAuditLogs((current) => [
      {
        ...log,
        createdAt: new Date().toISOString(),
        id: crypto.randomUUID()
      },
      ...current
    ]);
  }

  return (
    <section className="w-full rounded-lg border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="shrink-0">
          <h2 className="text-lg font-black leading-tight text-slate-950">Task Register</h2>
          <p className="text-xs font-bold text-slate-500">
            {hasActiveDataQuery
              ? `${filteredRows.length.toLocaleString()} matching · ${rows.length.toLocaleString()} rows`
              : `${rows.length.toLocaleString()} rows`}
          </p>
        </div>

        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search className="size-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search task, entity, owner, document, invoice"
            value={search}
          />
        </label>

        <select
          aria-label="Status Open/Close"
          className="h-10 shrink-0 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="">Status: All</option>
          <option value="Open">Open</option>
          <option value="Close">Close</option>
        </select>

        <div className="relative shrink-0">
          <button
            className={`${buttonClass("light")} ${dueRange.preset ? "border-navy-300 text-navy-800" : ""}`}
            onClick={() => setIsDateRangeOpen((current) => !current)}
            type="button"
          >
            <CalendarDays className="size-4" />
            {dueRangeLabel(dueRange) || "Date range"}
            <ChevronDown className="size-3.5" />
          </button>
          {isDateRangeOpen ? (
            <>
              <div className="fixed inset-0 z-[70]" onClick={() => setIsDateRangeOpen(false)} />
              <div className="absolute right-0 z-[75] mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Due date range</p>
                {dueRangePresets.map((preset) => (
                  <button
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-bold ${dueRange.preset === preset.key ? "bg-navy-50 text-navy-800" : "text-slate-700 hover:bg-slate-50"}`}
                    key={preset.key}
                    onClick={() => { setDueRange({ end: "", preset: preset.key, start: "" }); if (preset.key !== "custom") setIsDateRangeOpen(false); }}
                    type="button"
                  >
                    {preset.label}
                    {dueRange.preset === preset.key ? <CircleDot className="size-3.5" /> : null}
                  </button>
                ))}
                {dueRange.preset === "custom" ? (
                  <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400">From
                      <input className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-navy-400" onChange={(event) => setDueRange((current) => ({ ...current, start: event.target.value }))} type="date" value={dueRange.start} />
                    </label>
                    <label className="block text-[10px] font-black uppercase text-slate-400">To
                      <input className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-navy-400" onChange={(event) => setDueRange((current) => ({ ...current, end: event.target.value }))} type="date" value={dueRange.end} />
                    </label>
                  </div>
                ) : null}
                {dueRange.preset ? (
                  <button
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    onClick={() => { setDueRange({ end: "", preset: "", start: "" }); setIsDateRangeOpen(false); }}
                    type="button"
                  >
                    <X className="size-3.5" /> Clear date range
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <div className="relative shrink-0">
          <button
            className={`${buttonClass("light")} ${activeViewId ? "border-navy-300 text-navy-800" : ""}`}
            onClick={() => setIsViewsOpen((current) => !current)}
            type="button"
          >
            <Bookmark className="size-4" />
            {savedViews.find((view) => view.id === activeViewId)?.name ?? "My Views"}
            <ChevronDown className="size-3.5" />
          </button>
          {isViewsOpen ? (
            <>
              <div className="fixed inset-0 z-[70]" onClick={() => setIsViewsOpen(false)} />
              <div className="absolute right-0 z-[75] mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Saved views</p>
                <div className="max-h-56 overflow-y-auto">
                  {savedViews.length ? (
                    savedViews.map((view) => (
                      <div
                        className={`group flex items-center gap-1 rounded-md px-1 ${activeViewId === view.id ? "bg-navy-50" : "hover:bg-slate-50"}`}
                        key={view.id}
                      >
                        <button
                          className={`flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1.5 text-left text-xs font-bold ${activeViewId === view.id ? "text-navy-800" : "text-slate-700"}`}
                          onClick={() => applyView(view)}
                          type="button"
                        >
                          {activeViewId === view.id ? <Check className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
                          <span className="truncate">{view.name}</span>
                        </button>
                        <button className="shrink-0 rounded p-1 text-slate-400 hover:text-navy-700" onClick={() => void renameView(view)} title="Rename view" type="button">
                          <Pencil className="size-3" />
                        </button>
                        <button className="shrink-0 rounded p-1 text-slate-400 hover:text-rose-600" onClick={() => void deleteView(view)} title="Delete view" type="button">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="px-2 py-2 text-xs font-semibold text-slate-400">No saved views yet.</p>
                  )}
                </div>
                {activeViewId ? (
                  <button
                    className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    onClick={() => { const active = savedViews.find((view) => view.id === activeViewId); if (active) void saveView(active.name, active.id); }}
                    type="button"
                  >
                    Update this view with current filters
                  </button>
                ) : null}
                <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                  <p className="px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Save current as new view</p>
                  <div className="flex gap-1.5">
                    <input
                      className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-navy-400"
                      onChange={(event) => setViewNameDraft(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter" && viewNameDraft.trim()) void saveView(viewNameDraft); }}
                      placeholder="View name"
                      value={viewNameDraft}
                    />
                    <button
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-navy-700 px-2.5 text-xs font-bold text-white transition hover:bg-navy-800 disabled:opacity-40"
                      disabled={!viewNameDraft.trim()}
                      onClick={() => void saveView(viewNameDraft)}
                      type="button"
                    >
                      <Plus className="size-3.5" /> Save
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <Link className={`${buttonClass("light")} shrink-0`} href="/task-hub">
          <Workflow className="size-4" />
          Task Hub
        </Link>

        <div className="relative shrink-0">
          <button
            aria-label="Actions menu"
            className={buttonClass("dark")}
            onClick={() => setIsToolbarMenuOpen((current) => !current)}
            type="button"
          >
            <Menu className="size-4" />
            Actions
          </button>
          {isToolbarMenuOpen ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => { setIsToolbarMenuOpen(false); setIsMasterSubmenuOpen(false); }} />
              <div className="absolute right-0 top-12 z-40 w-52 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-2xl">
                <button
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setIsMasterSubmenuOpen((current) => !current)}
                  type="button"
                >
                  <span className="flex items-center gap-2"><ListChecks className="size-4 shrink-0 text-slate-500" />Master</span>
                  <ChevronDown className={`size-4 shrink-0 text-slate-400 transition ${isMasterSubmenuOpen ? "rotate-180" : ""}`} />
                </button>
                {isMasterSubmenuOpen ? (
                  <div className="border-y border-slate-100 bg-slate-50 pl-3">
                    <ToolbarMenuItem icon={ListChecks} label="Task Master" onClick={() => { setIsToolbarMenuOpen(false); setIsMasterSubmenuOpen(false); setMasterKind("task"); setIsMasterOpen(true); void loadMasters(); }} />
                    <ToolbarMenuItem icon={CircleDot} label="Stage Master" onClick={() => { setIsToolbarMenuOpen(false); setIsMasterSubmenuOpen(false); setMasterKind("stage"); setIsMasterOpen(true); void loadStageMasters(); }} />
                  </div>
                ) : null}
                <ToolbarMenuItem icon={Settings2} label="Columns" onClick={() => { setIsToolbarMenuOpen(false); setIsColumnOptionsOpen(true); }} />
                <ToolbarMenuItem icon={Download} label="Export view" onClick={() => { setIsToolbarMenuOpen(false); void exportView(); }} />
                <ToolbarMenuItem icon={Download} label="Download template" onClick={() => { setIsToolbarMenuOpen(false); downloadTemplate(); }} />
                <ToolbarMenuItem icon={Upload} label="Import" onClick={() => { setIsToolbarMenuOpen(false); fileInputRef.current?.click(); }} />
                <ToolbarMenuItem icon={History} label={viewMode === "register" ? "Audit Trail" : "Back to Register"} onClick={() => { setIsToolbarMenuOpen(false); if (viewMode === "register") void showAuditTrail(); else setViewMode("register"); }} />
                {hasActiveColumnFilters ? (
                  <ToolbarMenuItem icon={X} label="Clear column filters" onClick={() => { setIsToolbarMenuOpen(false); setColumnFilters({}); }} />
                ) : null}
              </div>
            </>
          ) : null}
          {isColumnOptionsOpen ? (
            <TaskLineColumnOptionsPanel
              frozenColumnKeys={frozenColumnKeys}
              hiddenColumnKeys={hiddenColumnKeys}
              onApply={(layout) => {
                const normalizedLayout = normalizeTaskLineColumnLayout(layout);
                setColumnOrder(normalizedLayout.order);
                setHiddenColumnKeys(new Set(normalizedLayout.hiddenColumnKeys));
                setFrozenColumnKeys(new Set(normalizedLayout.frozenColumnKeys));
                setIsColumnOptionsOpen(false);
                saveTaskLineColumnLayout(normalizedLayout);
                addAuditLog({
                  action: "taskline.column_layout",
                  newValue: `${taskLineColumns.length - normalizedLayout.hiddenColumnKeys.length} visible columns`
                });
              }}
              onClose={() => setIsColumnOptionsOpen(false)}
              orderedColumns={orderedColumns}
            />
          ) : null}
        </div>
      </div>

      <input
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importWorkbook(file);
          event.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />

      {message ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">{message}</p>
      ) : null}

      {viewMode === "register" ? (
      <div className="mt-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {taskLineColumnGroups.map((group) => (
            <button
              className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-black transition ${
                activeColumnGroup === group.key
                  ? "border-navy-700 bg-navy-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              key={group.key}
              onClick={() => setActiveColumnGroup(group.key)}
              type="button"
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="mb-1.5 flex items-center justify-end gap-1.5">
          {isLoading ? <span className="mr-auto text-xs font-bold text-slate-500">Loading TaskLine rows...</span> : null}
          <button
            className="inline-flex h-8 items-center gap-1 rounded-md border border-navy-700 bg-navy-700 px-3 text-xs font-bold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isLoading}
            onClick={addRow}
            title="Add a new TaskLine task"
            type="button"
          >
            <Plus className="size-3.5" />
            Add Task
          </button>
          <button
            className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            disabled={tablePage <= 1 || isLoading}
            onClick={() => goToPage(tablePage - 1)}
            type="button"
          >
            Prev
          </button>
          <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
            Page {tablePage} of {pageCount}
          </span>
          <button
            className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            disabled={tablePage >= pageCount || isLoading}
            onClick={() => goToPage(tablePage + 1)}
            type="button"
          >
            Next
          </button>
        </div>
        <div className="max-h-[calc(100vh-135px)] overflow-auto rounded-md border border-slate-200 bg-white">
          <table className="table-fixed border-separate border-spacing-0 text-left text-sm" style={{ minWidth: tableWidth, width: tableWidth }}>
            <colgroup>
              {actionColumnHidden ? null : <col style={{ width: actionColumnWidth }} />}
              {visibleColumns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
            <tr>
              {actionColumnHidden ? null : (
                <th
                  className={`border-r border-white/10 px-3 py-2 ${actionColumnFrozen ? "sticky left-0 z-20 bg-slate-100" : ""}`}
                  style={actionColumnFrozen ? { left: 0, width: actionColumnWidth } : { width: actionColumnWidth }}
                >
                  Actions
                </th>
              )}
              {visibleColumns.map((column) => {
                const isAsc = sortState?.key === column.key && sortState.dir === "asc";
                const isDesc = sortState?.key === column.key && sortState.dir === "desc";
                const hasValueFilter = Boolean(valueFilters[column.key]) || (column.key === "due_date" && dueColorFilter.length > 0);
                const frozen = frozenInfo(column.key);
                return (
                  <th
                    className={`border-r border-white/10 px-3 py-2 last:border-r-0 ${frozen.isFrozen ? "sticky z-20 bg-slate-100" : ""}`}
                    key={column.key}
                    style={frozen.isFrozen ? { left: frozen.left } : undefined}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left"
                        onClick={() => toggleSort(column.key)}
                        title={`Sort by ${column.label}`}
                        type="button"
                      >
                        <span className={`min-w-0 leading-tight ${column.key === "serial_no" ? "whitespace-nowrap" : "whitespace-normal break-words"}`}>{column.label}</span>
                        <span className="flex shrink-0 flex-col leading-none">
                          <ArrowUp className={`size-3 ${isAsc ? "text-navy-700" : "text-slate-300"}`} />
                          <ArrowDown className={`-mt-1 size-3 ${isDesc ? "text-navy-700" : "text-slate-300"}`} />
                        </span>
                      </button>
                      <button
                        aria-label={`Filter ${column.label}`}
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded border transition ${
                          hasValueFilter
                            ? "border-navy-600 bg-navy-600 text-white"
                            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100"
                        }`}
                        onClick={(event) => openColumnFilter(column.key, event.currentTarget)}
                        title={`Filter ${column.label}`}
                        type="button"
                      >
                        <Filter className="size-3" />
                      </button>
                    </div>
                    {openFilterKey === column.key && filterMenuPos ? (
                      <TaskLineFilterMenu
                        colorOptions={column.key === "due_date" ? dueColorCategories : undefined}
                         colorSelected={dueColorFilter}
                         columnLabel={column.label}
                         draft={filterDraft}
                         hasFilter={hasValueFilter}
                         isLoading={isFilterOptionsLoading}
                        onToggleColor={toggleDueColor}
                        menuPos={filterMenuPos}
                        onApply={() => applyColumnFilter(column.key)}
                        onCancel={closeColumnFilter}
                        onClear={() => {
                          clearColumnFilter(column.key);
                          if (column.key === "due_date") {
                            setDueColorFilter([]);
                          }
                        }}
                        onSearchChange={setFilterSearch}
                        onSortAsc={() => {
                          setSortState({ dir: "asc", key: column.key });
                          closeColumnFilter();
                        }}
                        onSortDesc={() => {
                          setSortState({ dir: "desc", key: column.key });
                          closeColumnFilter();
                        }}
                        onToggleAll={toggleVisibleDraftValues}
                        onToggleValue={toggleDraftValue}
                        search={filterSearch}
                        visibleOptions={visibleFilterOptions}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
            <tr className="bg-slate-50">
              {actionColumnHidden ? null : (
                <th
                  className={`border-r border-slate-200 px-2 py-1 ${actionColumnFrozen ? "sticky left-0 z-20 bg-slate-50" : ""}`}
                  style={actionColumnFrozen ? { left: 0 } : undefined}
                />
              )}
              {visibleColumns.map((column) => {
                const frozen = frozenInfo(column.key);
                return (
                  <th
                    className={`border-r border-slate-200 px-3 py-1 last:border-r-0 ${frozen.isFrozen ? "sticky z-20 bg-slate-50" : ""}`}
                    key={`filter-${column.key}`}
                    style={frozen.isFrozen ? { left: frozen.left } : undefined}
                  >
                    {column.key === "serial_no" ? null : (
                      <input
                        aria-label={`Filter ${column.label}`}
                        className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold normal-case text-slate-950 outline-none focus:border-navy-400"
                        onChange={(event) => setColumnFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                        placeholder="Filter"
                        value={columnFilters[column.key] ?? ""}
                      />
                    )}
                  </th>
                );
              })}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={visibleColumns.length + (actionColumnHidden ? 0 : 1)}>Loading TaskLine rows...</td></tr>
              ) : pagedRows.length ? pagedRows.map((row, rowIndex) => {
                const rowNameOptions = nameOptionsForTeam(text(row.team));
                const rowResourceOptions = resourceOptionsForTeam(text(row.team));
                return (
                <tr className="border-b border-slate-100 last:border-b-0" key={row.__id}>
                  {actionColumnHidden ? null : (
                  <td className={`border-r border-slate-100 px-2 py-1 ${actionColumnFrozen ? "sticky left-0 z-[5] bg-white" : ""}`} style={actionColumnFrozen ? { left: 0 } : undefined}>
                    <div className="flex items-center gap-1">
                      <button className="inline-flex size-7 items-center justify-center rounded border border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => openEditForm(row)} title="Edit row" type="button">
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="inline-flex size-7 items-center justify-center rounded border border-navy-200 text-navy-700 hover:bg-navy-50" onClick={() => viewRowHistory(row)} title="View history" type="button">
                        <History className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  )}
                  {visibleColumns.map((column) => {
                    const frozen = frozenInfo(column.key);
                    return (
                      <TaskLineCell
                        column={column}
                        entityOptions={entityOptions}
                        frozenLeft={frozen.left}
                        isFrozen={frozen.isFrozen}
                        key={`${row.__id}-${column.key}`}
                        nameOptions={rowNameOptions}
                        onCellChange={updateRow}
                        onDropdownOpen={loadDropdownOptions}
                        resourceOptions={rowResourceOptions}
                        row={row}
                        sectionOptions={sectionOptions}
                        serialNumber={(tablePage - 1) * taskLinePageSize + rowIndex + 1}
                        stageMasterNames={stageMasterNames}
                        taskMasterNames={taskMasterNames}
                      />
                    );
                  })}
                </tr>
                );
              }) : (
                <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={visibleColumns.length + (actionColumnHidden ? 0 : 1)}>No TaskLine rows match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {viewMode === "audit" ? (
        isAuditLoading
          ? <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">Loading audit trail...</p>
          : <TaskLineAuditTable logs={auditLogs} rows={rows} />
      ) : null}

      {formDraft ? (
        <TaskLineForm
          draft={formDraft}
          entityOptions={entityOptions}
          isEdit={Boolean(editingRowId)}
          onChange={updateFormDraft}
          onClose={() => {
            setEditingRowId(null);
            setFormDraft(null);
          }}
          onSubmit={saveFormDraft}
          nameOptionsForTeam={nameOptionsForTeam}
          resourceOptionsForTeam={resourceOptionsForTeam}
          sectionOptions={sectionOptions}
          stageMasterNames={stageMasterNames}
          taskMasterNames={taskMasterNames}
        />
      ) : null}

      {isMasterOpen ? (
        masterKind === "stage" ? (
          <TaskLineMasterPanel
            addPlaceholder="Add a new stage type"
            emptyText="No stage types yet. Add one above."
            heading="Stage Master"
            masters={stageMasters}
            message={stageMasterMessage}
            onClose={() => setIsMasterOpen(false)}
            onDelete={deleteStageMaster}
            onSave={saveStageMaster}
            subheading="Stage in TaskLine can only be chosen from this list."
            title="Manage stage types"
          />
        ) : (
          <TaskLineMasterPanel
            addPlaceholder="Add a new task type"
            emptyText="No task types yet. Add one above."
            heading="Task Master"
            masters={taskMasters}
            message={masterMessage}
            onClose={() => setIsMasterOpen(false)}
            onDelete={deleteTaskMaster}
            onSave={saveTaskMaster}
            subheading="Tasks in TaskLine can only be chosen from this list."
            title="Manage task types"
          />
        )
      ) : null}
    </section>
  );
}

function buildTaskLineQueryString(
  visibleColumns: TaskLineColumn[],
  options: {
    columnFilters: Record<string, string>;
    dueColorFilter: string[];
    search: string;
    sortState: { dir: "asc" | "desc"; key: string } | null;
    statusFilter: string;
    valueFilters: Record<string, string[]>;
  }
) {
  const params = new URLSearchParams();
  const visibleKeys = new Set(visibleColumns.map((column) => column.key));
  const activeColumnFilters = Object.fromEntries(
    Object.entries(options.columnFilters)
      .filter(([key, value]) => visibleKeys.has(key) && value.trim())
      .sort(([first], [second]) => first.localeCompare(second))
  );
  const activeValueFilters = Object.fromEntries(
    Object.entries(options.valueFilters)
      .filter(([key, values]) => visibleKeys.has(key) && values.length)
      .sort(([first], [second]) => first.localeCompare(second))
  );

  if (options.search.trim()) params.set("q", options.search.trim());
  if (options.statusFilter) params.set("status", options.statusFilter);
  if (options.sortState) {
    params.set("sortKey", options.sortState.key);
    params.set("sortDir", options.sortState.dir);
  }
  if (Object.keys(activeColumnFilters).length) params.set("columnFilters", JSON.stringify(activeColumnFilters));
  if (Object.keys(activeValueFilters).length) params.set("valueFilters", JSON.stringify(activeValueFilters));
  if (options.dueColorFilter.length) params.set("dueColors", JSON.stringify([...options.dueColorFilter].sort()));
  return params.toString();
}

function filterAndSortTaskLineRows(
  sourceRows: TaskLineRow[],
  visibleColumns: TaskLineColumn[],
  options: {
    columnFilters: Record<string, string>;
    dueColorFilter: string[];
    search: string;
    sortState: { dir: "asc" | "desc"; key: string } | null;
    statusFilter: string;
    valueFilters: Record<string, string[]>;
  }
) {
  const query = options.search.trim().toLowerCase();
  const result = sourceRows.filter((row) => {
    const matchesSearch = !query || taskLineColumns.some((column) => text(row[column.key]).toLowerCase().includes(query));
    const matchesStatus = !options.statusFilter || row.status_open_close === options.statusFilter;
    const matchesColumnFilters = visibleColumns.every((column) => {
      const filter = text(options.columnFilters[column.key]).trim().toLowerCase();
      return !filter || text(row[column.key]).toLowerCase().includes(filter);
    });
    const matchesValueFilters = visibleColumns.every((column) => {
      const selected = options.valueFilters[column.key];
      return !selected || selected.includes(text(row[column.key]));
    });
    const matchesDueColor = !options.dueColorFilter.length || options.dueColorFilter.includes(dueDateCategory(text(row.due_date)));

    return matchesSearch && matchesStatus && matchesColumnFilters && matchesValueFilters && matchesDueColor;
  });

  if (!options.sortState) {
    return result;
  }

  const factor = options.sortState.dir === "asc" ? 1 : -1;
  const sortKey = options.sortState.key;
  const sortType = taskLineColumnByKey.get(sortKey)?.type;

  return [...result].sort((first, second) => {
    const rawA = text(first[sortKey]);
    const rawB = text(second[sortKey]);

    if (sortType === "date") {
      const dateA = parseTaskLineDueDate(rawA);
      const dateB = parseTaskLineDueDate(rawB);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return factor * (dateA.getTime() - dateB.getTime());
    }

    if (sortType === "number" || sortType === "money") {
      const numA = rawA === "" ? NaN : Number(rawA.replace(/[^0-9.-]/g, ""));
      const numB = rawB === "" ? NaN : Number(rawB.replace(/[^0-9.-]/g, ""));
      const validA = !Number.isNaN(numA);
      const validB = !Number.isNaN(numB);
      if (!validA && !validB) return 0;
      if (!validA) return 1;
      if (!validB) return -1;
      return factor * (numA - numB);
    }

    return factor * rawA.localeCompare(rawB, undefined, { numeric: true });
  });
}

const TaskLineCell = memo(function TaskLineCell({
  column,
  entityOptions,
  frozenLeft,
  isFrozen,
  nameOptions,
  onCellChange,
  onDropdownOpen,
  resourceOptions,
  row,
  sectionOptions,
  serialNumber,
  stageMasterNames,
  taskMasterNames
}: {
  column: TaskLineColumn;
  entityOptions: string[];
  frozenLeft: number;
  isFrozen: boolean;
  nameOptions: string[];
  onCellChange: (rowId: string, key: string, value: string) => void;
  onDropdownOpen: (columnKey: string) => void;
  resourceOptions: string[];
  row: TaskLineRow;
  sectionOptions: string[];
  serialNumber: number;
  stageMasterNames: string[];
  taskMasterNames: string[];
}) {
  const frozenStyle = isFrozen ? { left: frozenLeft } : undefined;
  const onChange = (value: string) => onCellChange(row.__id, column.key, value);

  if (column.key === "serial_no") {
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <span className="block h-7 px-1.5 py-1 font-semibold text-slate-700">{serialNumber}</span>
      </td>
    );
  }

  if (column.key === "task_code") {
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <span className="block h-7 truncate px-1.5 py-1 font-bold text-navy-700">{row[column.key] || serialNumber}</span>
      </td>
    );
  }

  if (column.key === "team") {
    const current = row[column.key] ?? "";
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <LazyTaskLineSelect current={current} onChange={onChange} options={teamOptions} placeholder="Select team" />
      </td>
    );
  }

  if (["entity", "state_name", "section"].includes(column.key)) {
    const current = row[column.key] ?? "";
    const options = column.key === "entity"
      ? entityOptions
      : column.key === "state_name"
        ? gstinStateOptions.map(([, state]) => state)
        : sectionOptions;
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <LazyTaskLineSelect
          current={current}
          onChange={onChange}
          onOpen={() => onDropdownOpen(column.key)}
          options={options}
          placeholder={column.key === "section" ? "Select Section" : `Select ${column.label}`}
        />
      </td>
    );
  }

  if (column.key === "entity_group") {
    return (
      <td className={`border-r border-slate-100 bg-slate-50 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5]" : ""}`} style={frozenStyle}>
        <input className="h-7 w-full cursor-not-allowed border-0 bg-transparent px-1.5 text-xs font-semibold text-slate-600 outline-none" readOnly title="Filled automatically from Entity" value={row[column.key] ?? ""} />
      </td>
    );
  }

  if (column.key === "period") {
    const current = row[column.key] ?? "";
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <LazyTaskLineSelect current={current} onChange={onChange} options={financialPeriodOptions} placeholder="Select period" />
      </td>
    );
  }

  if (column.key === "name") {
    const current = row[column.key] ?? "";
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <LazyTaskLineSelect current={current} onChange={onChange} onOpen={() => onDropdownOpen(column.key)} options={nameOptions} placeholder="Select" />
      </td>
    );
  }

  if (column.key === "resource") {
    const current = row[column.key] ?? "";
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <LazyTaskLineSelect current={current} onChange={onChange} onOpen={() => onDropdownOpen(column.key)} options={resourceOptions} placeholder="Select" />
      </td>
    );
  }

  if (column.key === "task") {
    const current = row[column.key] ?? "";
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <LazyTaskLineSelect current={current} onChange={onChange} onOpen={() => onDropdownOpen(column.key)} options={taskMasterNames} placeholder="Select task" />
      </td>
    );
  }

  if (column.key === "stage") {
    const current = row[column.key] ?? "";
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <LazyTaskLineSelect current={current} onChange={onChange} onOpen={() => onDropdownOpen(column.key)} options={stageMasterNames} placeholder="Select stage" />
      </td>
    );
  }

  if (column.key === "billable") {
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <LazyTaskLineSelect current={row[column.key] ?? ""} onChange={onChange} options={billableOptions} placeholder="Select" />
      </td>
    );
  }

  if (column.type === "select") {
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${isFrozen ? "sticky z-[5] bg-white" : ""}`} style={frozenStyle}>
        <LazyTaskLineSelect current={row[column.key] ?? ""} onChange={onChange} options={statusOptions} placeholder="Select" />
      </td>
    );
  }

  if (column.key === "due_date" || column.key === "ref_date") {
    const dueColor = column.key === "due_date" ? dueDateColorClass(row[column.key] ?? "") : "";
    return (
      <td className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${dueColor} ${isFrozen ? (dueColor ? "sticky z-[5]" : "sticky z-[5] bg-white") : ""}`} style={frozenStyle}>
        <TaskLineDateInput compact onChange={onChange} value={row[column.key] ?? ""} />
      </td>
    );
  }

  const dueColor = column.key === "due_date" ? dueDateColorClass(row[column.key] ?? "") : "";

  return (
    <td
      className={`border-r border-slate-100 px-3 py-1 last:border-r-0 ${dueColor} ${isFrozen ? (dueColor ? "sticky z-[5]" : "sticky z-[5] bg-white") : ""}`}
      style={frozenStyle}
    >
      <input
        className="h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-200 hover:bg-white focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
        onChange={(event) => onChange(event.target.value)}
        placeholder={column.type === "date" ? "dd-mm-yyyy" : undefined}
        type={column.type === "number" || column.type === "money" ? "number" : "text"}
        value={row[column.key] ?? ""}
      />
    </td>
  );
});

function LazyTaskLineSelect({
  current,
  onChange,
  onOpen,
  options,
  placeholder
}: {
  current: string;
  onChange: (value: string) => void;
  onOpen?: () => void;
  options: readonly string[];
  placeholder: string;
}) {
  const [isActive, setIsActive] = useState(false);

  function activate() {
    setIsActive(true);
    onOpen?.();
  }

  return (
    <select
      className={compactSelectClass}
      onBlur={() => setIsActive(false)}
      onMouseEnter={activate}
      onPointerDown={activate}
      onChange={(event) => {
        onChange(event.target.value);
        setIsActive(false);
      }}
      onFocus={activate}
      onMouseDown={activate}
      value={current}
    >
      {isActive ? (
        <>
          <option value="">{placeholder}</option>
          {options.filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}
          {current && !options.includes(current) ? <option value={current}>{current}</option> : null}
        </>
      ) : (
        <option value={current}>{current || placeholder}</option>
      )}
    </select>
  );
}

function TaskLineForm({
  draft,
  entityOptions,
  isEdit,
  nameOptionsForTeam,
  onChange,
  onClose,
  onSubmit,
  resourceOptionsForTeam,
  sectionOptions,
  stageMasterNames,
  taskMasterNames
}: {
  draft: TaskLineRow;
  entityOptions: string[];
  isEdit: boolean;
  nameOptionsForTeam: (team: string) => string[];
  onChange: (key: string, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  resourceOptionsForTeam: (team: string) => string[];
  sectionOptions: string[];
  stageMasterNames: string[];
  taskMasterNames: string[];
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-700/45 px-4 py-6">
      <section className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.30)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-700">{isEdit ? "Edit TaskLine row" : "New TaskLine row"}</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">{isEdit ? "Update task entry" : "Create task entry"}</h3>
          </div>
          <button className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50" onClick={onClose} title="Close form" type="button">
            <X className="size-4" />
          </button>
        </header>

        <div className="max-h-[68vh] overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {taskLineColumns.filter((column) => column.key !== "serial_no" && column.key !== "task_code").map((column) => (
              <label className={["remarks", "issue", "document_link", "el_reference", "fee_comments"].includes(column.key) ? "xl:col-span-2" : ""} key={column.key}>
                <span className="text-[10px] font-black uppercase text-slate-500">{column.label}</span>
                {column.key === "team" ? (
                  <select className={formSelectControlClass} onChange={(event) => onChange(column.key, event.target.value)} value={draft[column.key] ?? ""}>
                    <option value="">Select team</option>
                    {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
                    {draft[column.key] && !teamOptions.includes(draft[column.key]) ? <option hidden value={draft[column.key]}>{draft[column.key]}</option> : null}
                  </select>
                ) : ["entity", "state_name", "section"].includes(column.key) ? (
                  <select className={formSelectControlClass} onChange={(event) => onChange(column.key, event.target.value)} value={draft[column.key] ?? ""}>
                    <option value="">{column.key === "section" ? "Select Section" : `Select ${column.label}`}</option>
                    {(column.key === "entity" ? entityOptions : column.key === "state_name" ? gstinStateOptions.map(([, state]) => state) : sectionOptions)
                      .map((option) => <option key={option} value={option}>{option}</option>)}
                    {draft[column.key] && !(column.key === "entity" ? entityOptions : column.key === "state_name" ? gstinStateOptions.map(([, state]) => state) : sectionOptions).includes(draft[column.key]) ? (
                      <option value={draft[column.key]}>{draft[column.key]}</option>
                    ) : null}
                  </select>
                ) : column.key === "entity_group" ? (
                  <input className={`${formControlClass} cursor-not-allowed bg-slate-50 text-slate-600`} readOnly title="Filled automatically from Entity" value={draft[column.key] ?? ""} />
                ) : column.key === "period" ? (
                  <select className={formSelectControlClass} onChange={(event) => onChange(column.key, event.target.value)} value={draft[column.key] ?? ""}>
                    <option value="">Select period</option>
                    {financialPeriodOptions.map((period) => <option key={period} value={period}>{period}</option>)}
                    {draft[column.key] && !financialPeriodOptions.includes(draft[column.key]) ? <option hidden value={draft[column.key]}>{draft[column.key]}</option> : null}
                  </select>
                ) : column.key === "due_date" || column.key === "ref_date" ? (
                  <TaskLineDateInput onChange={(value) => onChange(column.key, value)} value={draft[column.key] ?? ""} />
                ) : column.key === "name" ? (
                  <select
                    className={formSelectControlClass}
                    onChange={(event) => onChange(column.key, event.target.value)}
                    value={draft[column.key] ?? ""}
                  >
                    <option value="">Select</option>
                    {nameOptionsForTeam(draft.team ?? "").map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    {draft[column.key] && !nameOptionsForTeam(draft.team ?? "").includes(draft[column.key]) ? (
                      <option value={draft[column.key]}>{draft[column.key]}</option>
                    ) : null}
                  </select>
                ) : column.key === "resource" ? (
                  <select
                    className={formSelectControlClass}
                    onChange={(event) => onChange(column.key, event.target.value)}
                    value={draft[column.key] ?? ""}
                  >
                    <option value="">Select</option>
                    {resourceOptionsForTeam(draft.team ?? "").map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    {draft[column.key] && !resourceOptionsForTeam(draft.team ?? "").includes(draft[column.key]) ? (
                      <option value={draft[column.key]}>{draft[column.key]}</option>
                    ) : null}
                  </select>
                ) : column.key === "task" ? (
                  <select
                    className={formSelectControlClass}
                    onChange={(event) => onChange(column.key, event.target.value)}
                    value={draft[column.key] ?? ""}
                  >
                    <option value="">Select task</option>
                    {taskMasterNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    {draft[column.key] && !taskMasterNames.includes(draft[column.key]) ? (
                      <option value={draft[column.key]}>{draft[column.key]} (not in master)</option>
                    ) : null}
                  </select>
                ) : column.key === "stage" ? (
                  <select
                    className={formSelectControlClass}
                    onChange={(event) => onChange(column.key, event.target.value)}
                    value={draft[column.key] ?? ""}
                  >
                    <option value="">Select stage</option>
                    {stageMasterNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    {draft[column.key] && !stageMasterNames.includes(draft[column.key]) ? (
                      <option value={draft[column.key]}>{draft[column.key]} (not in master)</option>
                    ) : null}
                  </select>
                ) : column.key === "billable" ? (
                  <select
                    className={formSelectControlClass}
                    onChange={(event) => onChange(column.key, event.target.value)}
                    value={draft[column.key] ?? ""}
                  >
                    <option value="">Select</option>
                    {billableOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : column.type === "select" ? (
                  <select
                    className={formSelectControlClass}
                    onChange={(event) => onChange(column.key, event.target.value)}
                    value={draft[column.key] ?? ""}
                  >
                    <option value="">Select</option>
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={formControlClass}
                    onChange={(event) => onChange(column.key, event.target.value)}
                    placeholder={column.type === "date" ? "dd-mm-yyyy" : undefined}
                    type={column.type === "number" || column.type === "money" ? "number" : "text"}
                    value={draft[column.key] ?? ""}
                  />
                )}
              </label>
            ))}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button className={buttonClass("light")} onClick={onClose} type="button">Cancel</button>
          <button className={buttonClass("primary")} onClick={onSubmit} type="button">
            {isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {isEdit ? "Save Changes" : "Create"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function TaskLineDateInput({ compact = false, onChange, value }: { compact?: boolean; onChange: (value: string) => void; value: string }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commitManualValue(input: HTMLInputElement) {
    const normalized = normalizeEditableTaskLineDate(draft);
    if (normalized === null) {
      input.setCustomValidity("Enter a valid date in DD-MM-YYYY format.");
      input.reportValidity();
      setDraft(value);
      return;
    }

    input.setCustomValidity("");
    setDraft(normalized);
    if (normalized !== value) onChange(normalized);
  }

  return (
    <div className={`relative ${compact ? "" : "mt-1"}`}>
      <input
        aria-label="Date in DD-MM-YYYY format"
        className={compact
          ? "h-7 w-full rounded-md border border-transparent bg-transparent py-1 pl-1.5 pr-8 text-xs font-semibold text-slate-700 outline-none hover:border-slate-200 hover:bg-white focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
          : `${formControlClass.replace("mt-1 ", "")} pr-10`}
        onBlur={(event) => commitManualValue(event.currentTarget)}
        onChange={(event) => {
          event.currentTarget.setCustomValidity("");
          setDraft(event.target.value);
        }}
        placeholder="dd-mm-yyyy"
        type="text"
        value={draft}
      />
      <label className={`absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer rounded text-slate-500 hover:bg-slate-100 hover:text-navy-700 ${compact ? "p-1" : "p-2"}`} title="Open calendar">
        <CalendarDays className={compact ? "size-3.5" : "size-4"} />
        <input
          aria-label="Choose date from calendar"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(event) => {
            const normalized = normalizeEditableTaskLineDate(event.target.value) ?? "";
            setDraft(normalized);
            onChange(normalized);
          }}
          tabIndex={-1}
          type="date"
          value={displayDateToIso(draft)}
        />
      </label>
    </div>
  );
}

const compactSelectClass = "h-7 w-full rounded-md border border-slate-200 bg-white pl-2 pr-7 text-xs font-bold outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100";
const formControlClass = "mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100";
const formSelectControlClass = `${formControlClass} pr-9`;

function TaskLineColumnOptionsPanel({
  frozenColumnKeys,
  hiddenColumnKeys,
  onApply,
  onClose,
  orderedColumns
}: {
  frozenColumnKeys: Set<string>;
  hiddenColumnKeys: Set<string>;
  onApply: (layout: TaskLineColumnLayout) => void;
  onClose: () => void;
  orderedColumns: TaskLineColumn[];
}) {
  const [draftHiddenColumnKeys, setDraftHiddenColumnKeys] = useState<Set<string>>(() => new Set(hiddenColumnKeys));
  const [draftFrozenColumnKeys, setDraftFrozenColumnKeys] = useState<Set<string>>(() => new Set(frozenColumnKeys));
  const [draftOrder, setDraftOrder] = useState<string[]>(() => orderedColumns.map((column) => column.key));
  const draftColumns = useMemo(
    () => draftOrder.map((key) => taskLineColumnByKey.get(key)).filter((column): column is TaskLineColumn => Boolean(column)),
    [draftOrder]
  );

  function toggleHiddenKey(key: string) {
    setDraftHiddenColumnKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleFrozenKey(key: string) {
    setDraftFrozenColumnKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleColumn(column: TaskLineColumn) {
    setDraftHiddenColumnKeys((current) => {
      const next = new Set(current);
      if (next.has(column.key)) {
        next.delete(column.key);
      } else {
        next.add(column.key);
      }
      return next;
    });
  }

  function toggleFreeze(column: TaskLineColumn) {
    setDraftFrozenColumnKeys((current) => {
      const next = new Set(current);
      if (next.has(column.key)) {
        next.delete(column.key);
      } else {
        next.add(column.key);
      }
      return next;
    });
  }

  function moveColumn(column: TaskLineColumn, direction: "down" | "up") {
    setDraftOrder((current) => {
      const index = current.indexOf(column.key);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  return (
    <div className="absolute right-0 top-12 z-40 w-[390px] rounded-md border border-slate-200 bg-white p-3 text-slate-950 shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-700">Columns</p>
          <p className="mt-1 text-sm font-bold text-slate-500">Hide, reorder, or freeze (pin) columns to the left.</p>
        </div>
        <button className="rounded-md border border-slate-200 px-2 py-1 text-xs font-black text-slate-700" onClick={onClose} type="button">Close</button>
      </div>
      <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
          <label className="flex min-w-0 cursor-pointer items-center gap-2">
            <input checked={!draftHiddenColumnKeys.has(actionColumnKey)} onChange={() => toggleHiddenKey(actionColumnKey)} type="checkbox" />
            <span className="min-w-0 truncate text-sm font-bold text-slate-700">Actions</span>
          </label>
          <button
            aria-label="Freeze Actions"
            className={`inline-flex size-7 items-center justify-center rounded-md border transition ${
              draftFrozenColumnKeys.has(actionColumnKey)
                ? "border-navy-600 bg-navy-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
            onClick={() => toggleFrozenKey(actionColumnKey)}
            title={draftFrozenColumnKeys.has(actionColumnKey) ? "Unfreeze column" : "Freeze column (pin to left)"}
            type="button"
          >
            <Pin className="size-3.5" />
          </button>
          <span />
          <span />
        </div>
        {draftColumns.map((column, index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-md border border-slate-200 px-2 py-2" key={column.key}>
            <label className="flex min-w-0 cursor-pointer items-center gap-2">
              <input checked={!draftHiddenColumnKeys.has(column.key)} onChange={() => toggleColumn(column)} type="checkbox" />
              <span className="min-w-0 truncate text-sm font-bold text-slate-700">{column.label}</span>
            </label>
            <button
              aria-label={`Freeze ${column.label}`}
              className={`inline-flex size-7 items-center justify-center rounded-md border transition ${
                draftFrozenColumnKeys.has(column.key)
                  ? "border-navy-600 bg-navy-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => toggleFreeze(column)}
              title={draftFrozenColumnKeys.has(column.key) ? "Unfreeze column" : "Freeze column (pin to left)"}
              type="button"
            >
              <Pin className="size-3.5" />
            </button>
            <button
              aria-label={`Move ${column.label} up`}
              className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
              disabled={index === 0}
              onClick={() => moveColumn(column, "up")}
              type="button"
            >
              <ArrowUp className="size-3.5" />
            </button>
            <button
              aria-label={`Move ${column.label} down`}
              className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
              disabled={index === draftColumns.length - 1}
              onClick={() => moveColumn(column, "down")}
              type="button"
            >
              <ArrowDown className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2 border-t border-slate-200 pt-3">
        <button
          className={buttonClass("light")}
          onClick={() => {
            setDraftOrder(defaultTaskLineColumnOrder);
            setDraftHiddenColumnKeys(new Set());
            setDraftFrozenColumnKeys(new Set());
          }}
          type="button"
        >
          Reset
        </button>
        <button className={buttonClass("primary")} onClick={() => onApply({ frozenColumnKeys: Array.from(draftFrozenColumnKeys), hiddenColumnKeys: Array.from(draftHiddenColumnKeys), order: draftOrder })} type="button">
          Apply
        </button>
      </div>
    </div>
  );
}

function TaskLineAuditTable({ logs, rows }: { logs: TaskLineAuditLog[]; rows: TaskLineRow[] }) {
  const serialByRowId = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.__id, index + 1));
    return map;
  }, [rows]);

  function rowNumber(log: TaskLineAuditLog) {
    const serial = log.entityId ? serialByRowId.get(log.entityId) : undefined;
    return serial ? String(serial) : "-";
  }

  return (
    <section className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <History className="size-4 text-rose-700" />
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">Edit History</h3>
      </div>
      <div className="max-h-[calc(100vh-130px)] overflow-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Changed By</th>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Old Value</th>
              <th className="px-3 py-2">New Value</th>
            </tr>
          </thead>
          <tbody>
            {logs.length ? logs.map((log) => (
              <tr className="border-b border-slate-100 last:border-b-0" key={log.id}>
                <td className="px-3 py-2 text-xs font-bold text-slate-500">{formatAuditTime(log.createdAt)}</td>
                <td className="px-3 py-2 font-black text-slate-900">{formatAuditAction(log.action)}</td>
                <td className="px-3 py-2 font-bold text-slate-700">{log.actorName || "-"}</td>
                <td className="px-3 py-2 font-bold text-slate-700">{rowNumber(log)}</td>
                <td className="px-3 py-2 font-semibold text-slate-700">{log.field || "-"}</td>
                <td className="max-w-[280px] whitespace-normal px-3 py-2 font-semibold leading-5 text-slate-500" title={log.oldValue || ""}>{log.oldValue || "-"}</td>
                <td className="max-w-[280px] whitespace-normal px-3 py-2 font-semibold leading-5 text-slate-900" title={log.newValue || ""}>{log.newValue || "-"}</td>
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-8 text-center font-bold text-slate-500" colSpan={7}>No TaskLine edit history yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm text-slate-950">{value}</p>
    </div>
  );
}

function buttonClass(tone: "dark" | "light" | "primary") {
  const base = "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50";
  if (tone === "primary") {
    return `${base} bg-navy-700 text-white hover:bg-navy-800`;
  }
  if (tone === "dark") {
    return `${base} bg-navy-700 text-white hover:bg-navy-800`;
  }

  return `${base} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50`;
}

function createEmptyRow(id: string): TaskLineRow {
  return taskLineColumns.reduce<TaskLineRow>(
    (row, column) => {
      row[column.key] = "";
      return row;
    },
    { __id: id }
  );
}

function rowFromImport(rawRow: Record<string, unknown>) {
  return taskLineColumns.reduce<TaskLineRow>(
    (row, column) => {
      const value = rawRow[column.label];
      row[column.key] = column.type === "date" ? normalizeTaskLineDateInput(value) : text(value);
      return row;
    },
    { __id: `import-${crypto.randomUUID()}` }
  );
}

function normalizeTaskLineDateInput(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDisplayDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialDateToDisplay(value);
  }

  const rawValue = text(value);

  if (!rawValue) {
    return "";
  }

  const excelSerial = Number(rawValue);

  if (/^\d{4,6}(\.0+)?$/.test(rawValue) && Number.isFinite(excelSerial)) {
    return excelSerialDateToDisplay(excelSerial);
  }

  const dayMonthYear = rawValue.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);

  if (dayMonthYear) {
    const day = Number(dayMonthYear[1]);
    const month = Number(dayMonthYear[2]);
    const year = Number(dayMonthYear[3].length === 2 ? `20${dayMonthYear[3]}` : dayMonthYear[3]);
    return makeDisplayDate(year, month, day);
  }

  const yearMonthDay = rawValue.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (yearMonthDay) {
    return makeDisplayDate(Number(yearMonthDay[1]), Number(yearMonthDay[2]), Number(yearMonthDay[3]));
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? rawValue : toDisplayDate(parsed);
}

function excelSerialDateToDisplay(value: number) {
  const date = new Date(Date.UTC(1899, 11, 30));
  date.setUTCDate(date.getUTCDate() + Math.floor(value));
  return toDisplayDate(date);
}

function makeDisplayDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "";
  }

  return toDisplayDate(date);
}

function toDisplayDate(value: Date) {
  return `${pad2(value.getUTCDate())}-${pad2(value.getUTCMonth() + 1)}-${value.getUTCFullYear()}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

async function postTaskLineImportBatch(importRows: TaskLineRow[]) {
  const response = await fetch("/api/taskline", {
    body: JSON.stringify({ action: "import", importRows, returnRows: false }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    summary?: { added: number; deleted: number; updated: number };
  };

  if (!response.ok) {
    throw new Error(result.error ?? `Could not import TaskLine rows. Server returned ${response.status}.`);
  }

  return result;
}

function hasTaskLineValue(row: TaskLineRow) {
  return taskLineColumns.some((column) => column.key !== "serial_no" && text(row[column.key]).trim());
}

function getRowLabel(row: TaskLineRow | undefined, rows: TaskLineRow[]) {
  if (!row) {
    return "";
  }

  const serialNumber = rows.findIndex((item) => item.__id === row.__id) + 1;
  const name = text(row.name || row.task || row.entity);
  return [serialNumber ? `#${serialNumber}` : "", name].filter(Boolean).join(" - ");
}

function getChangedFields(oldRow: TaskLineRow | undefined, nextRow: TaskLineRow) {
  if (!oldRow) {
    return ["Row saved"];
  }

  return taskLineColumns
    .filter((column) => text(oldRow[column.key]) !== text(nextRow[column.key]))
    .map((column) => column.label);
}

function toDisplayRow(row: TaskLineRow) {
  return taskLineColumns.reduce<Record<string, string>>((result, column) => {
    result[column.label] = row[column.key] ?? "";
    return result;
  }, {});
}

function formatAuditAction(action: string) {
  return action.replace("taskline.", "").replace(/_/g, " ");
}

function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatServerAuditLog(log: Record<string, unknown>): TaskLineAuditLog {
  const oldValue = readAuditValue(log.old_value);
  const newValue = readAuditValue(log.new_value);
  const change = summarizeAuditChange(oldValue, newValue);

  return {
    action: text(log.action),
    actorName: text(log.actor_name),
    createdAt: text(log.created_at),
    entityId: text(log.entity_id) || readAuditId(log.old_value) || readAuditId(log.new_value),
    field: change.field,
    id: text(log.id) || crypto.randomUUID(),
    newValue: change.newValue,
    oldValue: change.oldValue,
    rowLabel: getAuditRowLabel(oldValue || newValue)
  };
}

function readAuditId(value: unknown) {
  if (value && typeof value === "object" && "id" in value) {
    return text((value as { id?: unknown }).id);
  }
  return "";
}

function summarizeAuditChange(oldValue: TaskLineRow | null, newValue: TaskLineRow | null) {
  const summarySource = newValue ?? oldValue;
  if (summarySource && ("added" in summarySource || "updated" in summarySource || "deleted" in summarySource)) {
    return { field: "Import", newValue: summarizeAuditValue(newValue), oldValue: summarizeAuditValue(oldValue) };
  }

  if (oldValue && newValue) {
    const changed = taskLineColumns.filter((column) => text(oldValue[column.key]) !== text(newValue[column.key]));
    if (!changed.length) {
      return { field: "-", newValue: "-", oldValue: "-" };
    }
    return {
      field: changed.map((column) => column.label).join(", "),
      newValue: changed.map((column) => text(newValue[column.key]) || "-").join("; "),
      oldValue: changed.map((column) => text(oldValue[column.key]) || "-").join("; ")
    };
  }

  if (newValue) {
    return { field: "New row", newValue: getAuditRowLabel(newValue) || "New row", oldValue: "-" };
  }

  if (oldValue) {
    return { field: "Deleted row", newValue: "-", oldValue: getAuditRowLabel(oldValue) || "Deleted row" };
  }

  return { field: "-", newValue: "-", oldValue: "-" };
}

function readAuditValue(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as { data?: TaskLineRow } & TaskLineRow;
  return record.data ?? record;
}

function summarizeAuditValue(value: TaskLineRow | null) {
  if (!value) {
    return "";
  }

  if ("added" in value || "updated" in value || "deleted" in value) {
    return [
      `Added: ${text(value.added) || "0"}`,
      `Updated: ${text(value.updated) || "0"}`,
      `Deleted: ${text(value.deleted) || "0"}`
    ].join("; ");
  }

  const priorityKeys = [
    "name",
    "entity",
    "entity_group",
    "task",
    "due_date",
    "stage",
    "status_open_close",
    "poc",
    "pending_from",
    "billing_status",
    "tax_invoice_no",
    "amount_raised",
    "amount_realised"
  ];
  const summaryParts = priorityKeys
    .map((key) => {
      const column = taskLineColumnByKey.get(key);
      const fieldValue = text(value[key]);
      return fieldValue ? `${column?.label ?? key}: ${fieldValue}` : "";
    })
    .filter(Boolean)
    .slice(0, 8);

  if (summaryParts.length) {
    return summaryParts.join("; ");
  }

  const filledFields = taskLineColumns
    .map((column) => {
      const fieldValue = text(value[column.key]);
      return fieldValue ? `${column.label}: ${fieldValue}` : "";
    })
    .filter(Boolean)
    .slice(0, 8);

  return filledFields.length ? filledFields.join("; ") : "Blank row";
}

function getAuditRowLabel(value: TaskLineRow | null) {
  if (!value) {
    return "";
  }

  return [text(value.name), text(value.task), text(value.entity)].filter(Boolean).join(" - ");
}

function blankExportRow() {
  return taskLineColumns.reduce<Record<string, string>>(
    (row, column) => {
      row[column.label] = "";
      return row;
    },
    { [importActionColumn]: "Add" }
  );
}

function addImportActionDropdown(worksheet: XLSX.WorkSheet, rowCount: number) {
  const worksheetWithValidation = worksheet as XLSX.WorkSheet & {
    "!dataValidation"?: Array<Record<string, unknown>>;
  };
  worksheetWithValidation["!dataValidation"] = worksheetWithValidation["!dataValidation"] ?? [];
  worksheetWithValidation["!dataValidation"].push({
    allowBlank: false,
    prompt: "Choose Add, Update, or Delete",
    sqref: `A2:A${rowCount + 1}`,
    type: "list",
    formula1: `"${importActionOptions.join(",")}"`
  });
}

function normalizeTaskLineColumnLayout(layout: Partial<TaskLineColumnLayout>): TaskLineColumnLayout {
  const knownColumnKeys = new Set(defaultTaskLineColumnOrder);
  const toggleableKeys = new Set([...defaultTaskLineColumnOrder, actionColumnKey]);
  const savedOrder = Array.isArray(layout.order) ? layout.order.filter((key) => knownColumnKeys.has(key)) : [];
  const order = [...savedOrder, ...defaultTaskLineColumnOrder.filter((key) => !savedOrder.includes(key))];
  const hiddenColumnKeys = Array.isArray(layout.hiddenColumnKeys)
    ? layout.hiddenColumnKeys.filter((key) => toggleableKeys.has(key))
    : ["team", "serial_no"];
  const frozenColumnKeys = Array.isArray(layout.frozenColumnKeys)
    ? layout.frozenColumnKeys.filter((key) => toggleableKeys.has(key))
    : [];

  return { frozenColumnKeys, hiddenColumnKeys, order };
}

function saveTaskLineColumnLayout(layout: TaskLineColumnLayout) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(taskLineColumnLayoutStorageKey, JSON.stringify(normalizeTaskLineColumnLayout(layout)));
}

function getSavedTaskLineColumnLayout() {
  if (typeof window === "undefined") {
    return { frozenColumnKeys: [], hiddenColumnKeys: [], order: defaultTaskLineColumnOrder };
  }

  try {
    const savedLayout = window.localStorage.getItem(taskLineColumnLayoutStorageKey);
    return savedLayout
      ? normalizeTaskLineColumnLayout(JSON.parse(savedLayout) as Partial<TaskLineColumnLayout>)
      : { frozenColumnKeys: [], hiddenColumnKeys: [], order: defaultTaskLineColumnOrder };
  } catch {
    return { frozenColumnKeys: [], hiddenColumnKeys: [], order: defaultTaskLineColumnOrder };
  }
}

type TaskLineFilterInput = {
  columnFilters: Record<string, string>;
  dueColorFilter: string[];
  dueRange: { end: string; preset: string; start: string };
  search: string;
  sortState: { dir: "asc" | "desc"; key: string } | null;
  statusFilter: string;
  valueFilters: Record<string, string[]>;
};

function applyTaskLineFilters(sourceRows: TaskLineRow[], filters: TaskLineFilterInput) {
  const query = filters.search.trim().toLowerCase();
  const dueBounds = filters.dueRange.preset
    ? computeDueRangeBounds(filters.dueRange.preset, filters.dueRange.start, filters.dueRange.end)
    : null;
  const result = sourceRows.filter((row) => {
    const matchesSearch = !query || taskLineColumns.some((column) => text(row[column.key]).toLowerCase().includes(query));
    const matchesStatus = !filters.statusFilter || text(row.status_open_close) === filters.statusFilter;
    const matchesColumns = Object.entries(filters.columnFilters).every(([key, value]) => {
      const needle = text(value).trim().toLowerCase();
      return !needle || text(row[key]).toLowerCase().includes(needle);
    });
    const matchesValues = Object.entries(filters.valueFilters).every(([key, values]) => !values.length || values.includes(text(row[key])));
    const matchesDueColor = !filters.dueColorFilter.length || filters.dueColorFilter.includes(dueDateCategory(text(row.due_date)));
    let matchesDueRange = true;
    if (dueBounds) {
      const due = parseTaskLineDueDate(text(row.due_date));
      matchesDueRange = Boolean(due) && (!dueBounds.from || due! >= dueBounds.from) && (!dueBounds.to || due! <= dueBounds.to);
    }
    return matchesSearch && matchesStatus && matchesColumns && matchesValues && matchesDueColor && matchesDueRange;
  });

  if (!filters.sortState) {
    return result;
  }

  const factor = filters.sortState.dir === "asc" ? 1 : -1;
  const sortKey = filters.sortState.key;
  const column = taskLineColumnByKey.get(sortKey);
  return [...result].sort((first, second) => {
    const rawA = text(first[sortKey]);
    const rawB = text(second[sortKey]);
    if (column?.type === "date") {
      const dateA = parseTaskLineDueDate(rawA);
      const dateB = parseTaskLineDueDate(rawB);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return factor * (dateA.getTime() - dateB.getTime());
    }
    if (column?.type === "number" || column?.type === "money") {
      const numA = rawA === "" ? Number.NaN : Number(rawA.replace(/[^0-9.-]/g, ""));
      const numB = rawB === "" ? Number.NaN : Number(rawB.replace(/[^0-9.-]/g, ""));
      const validA = !Number.isNaN(numA);
      const validB = !Number.isNaN(numB);
      if (!validA && !validB) return 0;
      if (!validA) return 1;
      if (!validB) return -1;
      return factor * (numA - numB);
    }
    return factor * rawA.localeCompare(rawB, undefined, { numeric: true });
  });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeOptionKey(value: unknown) {
  return text(value).toLocaleLowerCase().replace(/\s+/g, " ");
}

function uniqueSortedValues(values: unknown[], includeBlank = false) {
  const unique = new Map<string, string>();
  let hasBlank = false;

  for (const value of values) {
    const display = text(value);

    if (!display) {
      hasBlank = true;
      continue;
    }

    unique.set(normalizeOptionKey(display), unique.get(normalizeOptionKey(display)) ?? display);
  }

  const sortedValues = Array.from(unique.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  return includeBlank && hasBlank ? ["", ...sortedValues] : sortedValues;
}

function getFinancialPeriodOptions(now = new Date()) {
  const currentYear = now.getFullYear();
  const currentFinancialYearStart = now.getMonth() >= 3 ? currentYear : currentYear - 1;
  const finalYear = Math.max(2026, currentFinancialYearStart);
  return Array.from({ length: finalYear - 2017 + 1 }, (_, index) => {
    const startYear = 2017 + index;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
  });
}

function normalizeEditableTaskLineDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return "";

  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return makeDisplayDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) || null;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return makeDisplayDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) || null;
  }

  return null;
}

function displayDateToIso(value: unknown) {
  const normalized = normalizeEditableTaskLineDate(value);
  if (!normalized) return "";
  const [day, month, year] = normalized.split("-");
  return `${year}-${month}-${day}`;
}

function TaskLineFilterMenu({
  colorOptions,
  colorSelected,
  columnLabel,
  draft,
  hasFilter,
  isLoading,
  menuPos,
  onApply,
  onCancel,
  onClear,
  onSearchChange,
  onSortAsc,
  onSortDesc,
  onToggleAll,
  onToggleColor,
  onToggleValue,
  search,
  visibleOptions
}: {
  colorOptions?: { key: string; label: string; swatch: string }[];
  colorSelected: string[];
  columnLabel: string;
  draft: string[];
  hasFilter: boolean;
  isLoading: boolean;
  menuPos: { left: number; maxHeight: number; top: number };
  onApply: () => void;
  onCancel: () => void;
  onClear: () => void;
  onSearchChange: (value: string) => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onToggleAll: () => void;
  onToggleColor: (key: string) => void;
  onToggleValue: (value: string) => void;
  search: string;
  visibleOptions: string[];
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const allVisibleSelected = visibleOptions.length > 0 && visibleOptions.every((value) => draft.includes(value));
  const someVisibleSelected = visibleOptions.some((value) => draft.includes(value)) && !allVisibleSelected;

  return createPortal(
    <div
      className="fixed z-[1000] flex w-72 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-2 text-left text-slate-900 shadow-2xl"
      data-taskline-filter-menu="true"
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

      {colorOptions ? (
        <div className="mt-2 shrink-0 border-b border-slate-200 pb-2">
          <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Filter by colour</p>
          {colorOptions.map((option) => (
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-950 hover:bg-slate-100" key={option.key}>
              <input
                checked={colorSelected.includes(option.key)}
                className="size-4 accent-navy-700"
                onChange={() => onToggleColor(option.key)}
                type="checkbox"
              />
              <span className={`inline-block size-4 shrink-0 rounded ${option.swatch}`} />
              <span className="min-w-0 truncate">{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}

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
          onChange={(event) => onSearchChange(event.target.value)}
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
          {isLoading ? (
            <p className="py-6 text-center text-sm font-semibold text-slate-500">Loading values...</p>
          ) : visibleOptions.length ? (
            visibleOptions.map((value) => (
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-950" key={value || "(blank)"}>
                <input checked={draft.includes(value)} className="size-4 accent-navy-700" onChange={() => onToggleValue(value)} type="checkbox" />
                <span className="min-w-0 truncate" title={value || "(Blank)"}>{value || "(Blank)"}</span>
              </label>
            ))
          ) : (
            <p className="py-6 text-center text-sm font-semibold text-slate-500">No values found</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Due-date conditional colours (matches the TaskLine legend).
// bg-red-200 bg-yellow-300 bg-green-400 bg-blue-300 bg-amber-500 bg-orange-300
const dueColorCategories = [
  { key: "overdue", label: "Overdue", swatch: "bg-red-200" },
  { key: "today", label: "Due Today", swatch: "bg-yellow-300" },
  { key: "d7", label: "Due Within 7 Days", swatch: "bg-green-400" },
  { key: "d15", label: "Due Within 15 Days", swatch: "bg-blue-300" },
  { key: "d30", label: "Due Within 30 Days", swatch: "bg-amber-500" },
  { key: "d90", label: "Due Within 30-90 Days", swatch: "bg-orange-300" },
  { key: "none", label: "No colour (blank / 90+ days)", swatch: "border border-slate-300 bg-white" }
];

function dueDateCategory(value: string): string {
  const due = parseTaskLineDueDate(value);
  if (!due) {
    return "none";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return "overdue";
  }
  if (diffDays === 0) {
    return "today";
  }
  if (diffDays <= 7) {
    return "d7";
  }
  if (diffDays <= 15) {
    return "d15";
  }
  if (diffDays <= 30) {
    return "d30";
  }
  if (diffDays <= 90) {
    return "d90";
  }
  return "none";
}

function dueDateColorClass(value: string): string {
  const due = parseTaskLineDueDate(value);
  if (!due) {
    return "";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return "bg-red-200";
  }
  if (diffDays === 0) {
    return "bg-yellow-300";
  }
  if (diffDays <= 7) {
    return "bg-green-400";
  }
  if (diffDays <= 15) {
    return "bg-blue-300";
  }
  if (diffDays <= 30) {
    return "bg-amber-500";
  }
  if (diffDays <= 90) {
    return "bg-orange-300";
  }
  return "";
}

const dueRangePresets = [
  { key: "this_week", label: "This week" },
  { key: "previous_week", label: "Previous week" },
  { key: "this_month", label: "This month" },
  { key: "previous_month", label: "Previous month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "this_year", label: "This year" },
  { key: "previous_year", label: "Previous year" },
  { key: "custom", label: "Custom range" }
];

function dueRangeLabel(range: { end: string; preset: string; start: string }) {
  if (!range.preset) return "";
  if (range.preset === "custom") {
    if (range.start && range.end) return `${range.start} to ${range.end}`;
    if (range.start) return `From ${range.start}`;
    if (range.end) return `Until ${range.end}`;
    return "Custom range";
  }
  return dueRangePresets.find((preset) => preset.key === range.preset)?.label ?? "";
}

function computeDueRangeBounds(preset: string, start: string, end: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  const atStart = (date: Date) => { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; };
  const atEnd = (date: Date) => { const value = new Date(date); value.setHours(23, 59, 59, 999); return value; };
  const weekStart = (date: Date) => { const value = atStart(date); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return value; };
  switch (preset) {
    case "this_week": { const from = weekStart(now); const to = new Date(from); to.setDate(from.getDate() + 6); return { from, to: atEnd(to) }; }
    case "previous_week": { const from = weekStart(now); from.setDate(from.getDate() - 7); const to = new Date(from); to.setDate(from.getDate() + 6); return { from, to: atEnd(to) }; }
    case "this_month": return { from: atStart(new Date(now.getFullYear(), now.getMonth(), 1)), to: atEnd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
    case "previous_month": return { from: atStart(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: atEnd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "this_quarter": { const quarter = Math.floor(now.getMonth() / 3); return { from: atStart(new Date(now.getFullYear(), quarter * 3, 1)), to: atEnd(new Date(now.getFullYear(), quarter * 3 + 3, 0)) }; }
    case "this_year": return { from: atStart(new Date(now.getFullYear(), 0, 1)), to: atEnd(new Date(now.getFullYear(), 11, 31)) };
    case "previous_year": return { from: atStart(new Date(now.getFullYear() - 1, 0, 1)), to: atEnd(new Date(now.getFullYear() - 1, 11, 31)) };
    case "custom": { const from = start ? parseTaskLineDueDate(start) : null; const to = end ? parseTaskLineDueDate(end) : null; return { from: from ? atStart(from) : null, to: to ? atEnd(to) : null }; }
    default: return { from: null, to: null };
  }
}

function parseTaskLineDueDate(value: string): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function TaskLineMasterPanel({
  addPlaceholder,
  emptyText,
  heading,
  masters,
  message,
  onClose,
  onDelete,
  onSave,
  subheading,
  title
}: {
  addPlaceholder: string;
  emptyText: string;
  heading: string;
  masters: { id: string; name: string }[];
  message: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSave: (name: string, id?: string) => void;
  subheading: string;
  title: string;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-700/45 px-4 py-6">
      <section className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.30)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-700">{heading}</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{title}</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">{subheading}</p>
          </div>
          <button className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50" onClick={onClose} title="Close" type="button">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <input
            className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newName.trim()) {
                onSave(newName);
                setNewName("");
              }
            }}
            placeholder={addPlaceholder}
            value={newName}
          />
          <button
            className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-navy-700 px-4 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-50"
            disabled={!newName.trim()}
            onClick={() => {
              onSave(newName);
              setNewName("");
            }}
            type="button"
          >
            <Plus className="size-4" />
            Add
          </button>
        </div>

        {message ? <p className="border-b border-slate-200 px-5 py-2 text-sm font-bold text-rose-700">{message}</p> : null}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {masters.length ? (
            <div className="space-y-2">
              {masters.map((master, index) => (
                <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-2" key={master.id}>
                  <span className="w-8 shrink-0 text-center text-xs font-bold text-slate-400">{index + 1}</span>
                  {editingId === master.id ? (
                    <input
                      autoFocus
                      className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-slate-900 outline-none focus:border-rose-300"
                      onChange={(event) => setEditingName(event.target.value)}
                      value={editingName}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{master.name}</span>
                  )}
                  {editingId === master.id ? (
                    <button
                      className="inline-flex h-8 items-center justify-center rounded-md bg-navy-700 px-3 text-xs font-semibold text-white hover:bg-navy-800"
                      onClick={() => {
                        onSave(editingName, master.id);
                        setEditingId(null);
                      }}
                      type="button"
                    >
                      Save
                    </button>
                  ) : (
                    <button
                      aria-label={`Edit ${master.name}`}
                      className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setEditingId(master.id);
                        setEditingName(master.name);
                      }}
                      type="button"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  <button
                    aria-label={`Delete ${master.name}`}
                    className="inline-flex size-8 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
                    onClick={() => onDelete(master.id)}
                    type="button"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm font-bold text-slate-500">{emptyText}</p>
          )}
        </div>

        <footer className="flex justify-end border-t border-slate-200 px-5 py-3">
          <button className={buttonClass("light")} onClick={onClose} type="button">Done</button>
        </footer>
      </section>
    </div>
  );
}

function ToolbarMenuItem({
  icon: Icon,
  label,
  onClick
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4 shrink-0 text-slate-500" />
      {label}
    </button>
  );
}
