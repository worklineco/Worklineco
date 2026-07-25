"use client";

import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, CircleDot, Download, Filter, History, ListChecks, Menu, Pencil, Pin, Plus, Search, Settings2, Trash2, Upload, X } from "lucide-react";
import type { ComponentType } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx-js-style";
import { getCached, setCached } from "@/lib/data-cache";

type TaskLineColumn = {
  key: string;
  label: string;
  type?: "date" | "money" | "number" | "select" | "text";
  width: number;
};
type TaskLineRow = Record<string, string>;
type TaskLineColumnLayout = { frozenColumnKeys: string[]; hiddenColumnKeys: string[]; order: string[] };
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
const bulkDeleteLimit = 10;
const taskLinePageSize = 200;
const taskLineRowsCacheKey = "taskline:rows:v2";
const taskLineColumnLayoutStorageKey = "workline:taskline-column-layout:v2";
const selectionColumnWidth = 40;
const actionColumnWidth = 112;
const actionColumnKey = "__actions";
const taskLineColumns: TaskLineColumn[] = [
  { key: "team", label: "Team", width: 132 },
  { key: "serial_no", label: "S. No.", width: 84 },
  { key: "name", label: "Name", width: 150 },
  { key: "resource", label: "Resource", width: 140 },
  { key: "entity_group", label: "Entity Group", width: 150 },
  { key: "entity", label: "Entity", width: 180 },
  { key: "state_name", label: "State Name", width: 130 },
  { key: "task", label: "Task", width: 210 },
  { key: "due_date", label: "Due Date", type: "date", width: 128 },
  { key: "stage", label: "Stage", width: 132 },
  { key: "status_open_close", label: "Status Open/Close", type: "select", width: 155 },
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
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !hiddenColumnKeys.has(column.key)),
    [hiddenColumnKeys, orderedColumns]
  );
  const actionColumnHidden = hiddenColumnKeys.has(actionColumnKey);
  const actionColumnFrozen = frozenColumnKeys.has(actionColumnKey);
  const tableWidth = useMemo(() => selectionColumnWidth + (actionColumnHidden ? 0 : actionColumnWidth) + visibleColumns.reduce((total, column) => total + column.width, 0), [actionColumnHidden, visibleColumns]);
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
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = rows.filter((row) => {
      const matchesSearch = !query || taskLineColumns.some((column) => text(row[column.key]).toLowerCase().includes(query));
      const matchesStatus = !statusFilter || row.status_open_close === statusFilter;
      const matchesColumnFilters = visibleColumns.every((column) => {
        const filter = text(columnFilters[column.key]).trim().toLowerCase();
        return !filter || text(row[column.key]).toLowerCase().includes(filter);
      });
      const matchesValueFilters = visibleColumns.every((column) => {
        const selected = valueFilters[column.key];
        return !selected || selected.includes(text(row[column.key]));
      });
      const matchesDueColor = !dueColorFilter.length || dueColorFilter.includes(dueDateCategory(text(row.due_date)));

      return matchesSearch && matchesStatus && matchesColumnFilters && matchesValueFilters && matchesDueColor;
    });

    if (sortState) {
      const factor = sortState.dir === "asc" ? 1 : -1;
      const sortType = taskLineColumnByKey.get(sortState.key)?.type;

      return [...result].sort((first, second) => {
        const rawA = text(first[sortState.key]);
        const rawB = text(second[sortState.key]);

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

    return result;
  }, [columnFilters, dueColorFilter, rows, search, sortState, statusFilter, valueFilters, visibleColumns]);
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim());
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / taskLinePageSize));
  const pagedRows = useMemo(() => {
    const startIndex = (tablePage - 1) * taskLinePageSize;
    return filteredRows.slice(startIndex, startIndex + taskLinePageSize);
  }, [filteredRows, tablePage]);
  const selectedPageCount = pagedRows.filter((row) => selectedRowIds.has(row.__id)).length;
  const allPageRowsSelected = pagedRows.length > 0 && selectedPageCount === pagedRows.length;

  const dataHydratedRef = useRef(false);

  useEffect(() => {
    void loadTaskLine();
    void loadMasters();
    void loadStageMasters();
    void loadTeamMembers();
    void loadEntityMasters();
  }, []);

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
    setTablePage(1);
  }, [columnFilters, dueColorFilter, search, sortState, statusFilter, valueFilters]);

  useEffect(() => {
    setTablePage((currentPage) => Math.min(currentPage, pageCount));
  }, [pageCount]);

  function uniqueValuesForColumn(key: string) {
    const values = new Set<string>();
    for (const row of rows) {
      values.add(text(row[key]));
    }
    return Array.from(values).sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
  }

  const openColumnOptions = useMemo(
    () => (openFilterKey ? uniqueValuesForColumn(openFilterKey) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openFilterKey, rows]
  );
  const visibleFilterOptions = useMemo(() => {
    const query = filterSearch.trim().toLowerCase();
    return query ? openColumnOptions.filter((value) => value.toLowerCase().includes(query)) : openColumnOptions;
  }, [openColumnOptions, filterSearch]);

  function openColumnFilter(key: string, anchor: HTMLElement) {
    const options = uniqueValuesForColumn(key);
    setOpenFilterKey(key);
    setFilterSearch("");
    setFilterDraft(valueFilters[key] ? [...valueFilters[key]] : options);
    const rect = anchor.getBoundingClientRect();
    const width = 288;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.bottom + 4;
    const maxHeight = Math.max(240, window.innerHeight - top - 16);
    setFilterMenuPos({ left, maxHeight, top });
  }

  function closeColumnFilter() {
    setOpenFilterKey(null);
    setFilterMenuPos(null);
  }

  function applyColumnFilter(key: string) {
    const options = uniqueValuesForColumn(key);
    setValueFilters((current) => {
      const next = { ...current };
      if (filterDraft.length >= options.length) {
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
    try {
      const response = await fetch("/api/taskline/masters", { cache: "no-store" });
      const result = (await response.json()) as { error?: string; masters?: { id: string; name: string }[] };
      if (!response.ok) {
        setMasterMessage(result.error ?? "Could not load task master list.");
        return;
      }
      setTaskMasters(result.masters ?? []);
      setMasterMessage("");
    } catch {
      setM…19364 tokens truncated…{
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
    : ["team"];
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

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeOptionKey(value: unknown) {
  return text(value).toLocaleLowerCase().replace(/\s+/g, " ");
}

function uniqueSortedValues(values: unknown[]) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const display = text(value);
    if (display) unique.set(normalizeOptionKey(display), unique.get(normalizeOptionKey(display)) ?? display);
  }
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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
          {visibleOptions.length ? (
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

