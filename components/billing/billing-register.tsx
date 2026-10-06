"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Filter, ChevronDown, Download, History, Link2, Maximize2, Menu, Pencil, Pin, Plus, RotateCcw, Search, Settings2, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import type { ComponentType } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BillingColumnFilter } from "@/components/billing/billing-column-filter";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { getCached, setCached } from "@/lib/data-cache";
import { LoadingIndicator } from "@/components/shared/loading-indicator";
import * as XLSX from "xlsx-js-style";

type BillingRecord = {
  amount: number;
  billing_status: string;
  cgst: number;
  client: string;
  cost_center: string;
  created_at?: string;
  description: string;
  group_name: string;
  gstin: string;
  gstat_appeal_id: string | null;
  id?: string;
  igst: number;
  include_ope_in_fees: string;
  income_head: string;
  is_retainer: string;
  task_code: string;
  invoice_date: string | null;
  invoice_no: string;
  memo_date: string | null;
  memo_no: string;
  ope: number;
  ope_remarks: string;
  owner_team: string;
  place_of_supply: string;
  address: string;
  person_authorised: string;
  escalation_1: string;
  poc_email: string;
  poc_mobile: string;
  poc_name: string;
  receiving_date: string | null;
  receiving_status: string;
  amount_received: number;
  pending_amount: number;
  registration_type: string;
  remarks: string;
  accounts_remark: string;
  serial_no?: number;
  sgst: number;
  source_module: string;
  pushed_by?: string;
  total: number;
  version_no: number;
  voucher_type: string;
};
type GstatMatter = {
  client: string;
  gstin: string;
  id: string;
  label: string;
  matter_description: string;
  owner_team: string;
  row_number: number;
};
type AccessScope = {
  canEditAccountsFields: boolean;
  canManageMasters: boolean;
  canViewAll: boolean;
  role: string;
  team: string;
};
type AuditLog = {
  action: string;
  actor_name?: string | null;
  actor_user_id?: string | null;
  created_at: string;
  entity_id: string | null;
  id: string;
  new_value: Partial<BillingRecord> | null;
  old_value: Partial<BillingRecord> | null;
};
type AuditChange = { field: string; label: string; newValue: string; oldValue: string };
type TrashRecord = {
  data: Partial<BillingRecord>;
  delete_action: string;
  deleted_at: string;
  deleted_by: string | null;
  expires_at: string;
  id: string;
  original_billing_id: string | null;
};
type ClientRegisterRow = Record<string, string | number>;
type BillingField = keyof BillingRecord;
type BillingColumn = {
  field: BillingField | "gstat_link" | "actions";
  label: string;
  type?: "date" | "money" | "select" | "text";
  width: number;
};
type BillingColumnLayout = { frozenColumnKeys: string[]; hiddenColumnKeys: string[]; order: string[] };
type InlineEditor = { field: BillingField; recordId: string; value: string };
type BillingView = "audit" | "register" | "trash";

const emptyRecord: BillingRecord = {
  amount: 0,
  billing_status: "Draft",
  cgst: 0,
  client: "",
  cost_center: "",
  description: "",
  group_name: "",
  gstin: "",
  gstat_appeal_id: null,
  igst: 0,
  include_ope_in_fees: "No",
  income_head: "",
  is_retainer: "",
  task_code: "",
  invoice_date: "",
  invoice_no: "",
  memo_date: "",
  memo_no: "",
  ope: 0,
  ope_remarks: "",
  owner_team: "",
  place_of_supply: "",
  address: "",
  person_authorised: "",
  escalation_1: "",
  poc_email: "",
  poc_mobile: "",
  poc_name: "",
  receiving_date: "",
  receiving_status: "Pending",
  amount_received: 0,
  pending_amount: 0,
  registration_type: "",
  remarks: "",
  accounts_remark: "",
  serial_no: undefined,
  sgst: 0,
  source_module: "manual",
  pushed_by: "",
  total: 0,
  version_no: 1,
  voucher_type: "Proforma Invoice"
};
const defaultMasters: Record<string, string[]> = {
  billing_status: ["Draft", "Memo Raised", "Invoice Raised", "Marked for Review", "Marked for Changes", "Cancelled"],
  cost_center: [],
  group_name: [],
  income_head: [],
  receiving_status: ["Pending", "Received", "Part Received", "YD"],
  voucher_type: ["Proforma Invoice", "Tax Invoice", "Debit Note", "Credit Note"]
};
const gstStateByCode: Record<string, string> = {
  "01": "Jammu And Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Orissa",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra And Nagar Haveli & Daman And Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman And Nicobar",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Other Country"
};
const billingColumns: BillingColumn[] = [
  { field: "actions", label: "Actions", width: 92 },
  { field: "task_code", label: "Task Code", type: "select", width: 140 },
  { field: "owner_team", label: "Team", type: "text", width: 128 },
  { field: "source_module", label: "Pushed From Sheet", type: "select", width: 160 },
  { field: "voucher_type", label: "Voucher", type: "select", width: 145 },
  { field: "is_retainer", label: "Retainer Bill", type: "select", width: 130 },
  { field: "group_name", label: "Group", type: "select", width: 145 },
  { field: "gstin", label: "GSTIN", type: "text", width: 160 },
  { field: "client", label: "Client", type: "text", width: 220 },
  { field: "place_of_supply", label: "Place of Supply", type: "text", width: 175 },
  { field: "address", label: "Address", type: "text", width: 260 },
  { field: "registration_type", label: "Registration Type", type: "text", width: 170 },
  { field: "escalation_1", label: "Escalation 1", type: "text", width: 170 },
  { field: "poc_name", label: "SPOC", type: "text", width: 145 },
  { field: "poc_mobile", label: "SPOC Mobile", type: "text", width: 135 },
  { field: "poc_email", label: "SPOC Email", type: "text", width: 200 },
  { field: "description", label: "Description", type: "text", width: 260 },
  { field: "amount", label: "Amount", type: "money", width: 118 },
  { field: "cgst", label: "CGST", type: "money", width: 104 },
  { field: "sgst", label: "SGST", type: "money", width: 104 },
  { field: "igst", label: "IGST", type: "money", width: 104 },
  { field: "ope", label: "OPE", type: "money", width: 110 },
  { field: "include_ope_in_fees", label: "Include OPE in Fee", type: "select", width: 150 },
  { field: "ope_remarks", label: "OPE Remarks", type: "text", width: 190 },
  { field: "total", label: "Total", width: 124 },
  { field: "billing_status", label: "Billing", type: "select", width: 140 },
  { field: "memo_no", label: "Memo No.", type: "text", width: 135 },
  { field: "memo_date", label: "Memo Date", type: "date", width: 132 },
  { field: "invoice_no", label: "Invoice No.", type: "text", width: 140 },
  { field: "invoice_date", label: "Invoice Date", type: "date", width: 132 },
  { field: "receiving_status", label: "Receipt Status", type: "select", width: 150 },
  { field: "receiving_date", label: "Receiving Date", type: "date", width: 142 },
  { field: "amount_received", label: "Amount Received", type: "money", width: 148 },
  { field: "pending_amount", label: "Pending Amount", type: "money", width: 148 },
  { field: "remarks", label: "Remarks", type: "text", width: 220 },
  { field: "accounts_remark", label: "Remark Accounts Team", type: "text", width: 220 },
  { field: "gstat_link", label: "GSTAT Link", width: 170 },
  { field: "pushed_by", label: "Pushed By", type: "text", width: 170 }
];
const billingColumnGroups: { columns: string[] | null; key: string; label: string }[] = [
  {
    key: "core",
    label: "Client & Matter",
    columns: ["actions", "task_code", "client", "owner_team", "group_name", "gstin", "place_of_supply", "address", "registration_type", "description", "poc_name", "poc_mobile", "poc_email", "escalation_1", "remarks", "accounts_remark", "gstat_link"]
  },
  {
    key: "fees",
    label: "Fees & Tax",
    columns: ["actions", "task_code", "client", "amount", "cgst", "sgst", "igst", "ope", "include_ope_in_fees", "ope_remarks", "total"]
  },
  {
    key: "receipt",
    label: "Invoice & Receipt",
    columns: ["actions", "task_code", "client", "billing_status", "memo_no", "memo_date", "invoice_no", "invoice_date", "receiving_status", "receiving_date", "amount_received", "pending_amount"]
  },
  { key: "all", label: "All", columns: null }
];
const billingColumnByKey = new Map(billingColumns.map((column) => [String(column.field), column]));
const defaultBillingColumnOrder = billingColumns.map((column) => String(column.field));
const billingColumnLayoutStorageKey = "workline:billing-column-layout:v1";
const importHeaders: Array<{ field: BillingField; label: string }> = [
  { field: "id", label: "Billing ID" },
  { field: "serial_no", label: "S.No." },
  { field: "owner_team", label: "Team" },
  { field: "task_code", label: "Task Code" },
  { field: "voucher_type", label: "Voucher Type" },
  { field: "is_retainer", label: "Retainer Bill" },
  { field: "group_name", label: "Group" },
  { field: "gstin", label: "GSTIN" },
  { field: "client", label: "Client" },
  { field: "place_of_supply", label: "Place of Supply" },
  { field: "address", label: "Address" },
  { field: "registration_type", label: "Registration Type" },
  { field: "escalation_1", label: "Escalation 1" },
  { field: "poc_name", label: "SPOC Name" },
  { field: "poc_mobile", label: "SPOC Mobile" },
  { field: "poc_email", label: "SPOC Email" },
  { field: "description", label: "Description" },
  { field: "amount", label: "Amount" },
  { field: "cgst", label: "CGST" },
  { field: "sgst", label: "SGST" },
  { field: "igst", label: "IGST" },
  { field: "ope", label: "OPE" },
  { field: "include_ope_in_fees", label: "Include OPE in Professional Fees" },
  { field: "ope_remarks", label: "OPE Remarks" },
  { field: "billing_status", label: "Billing Status" },
  { field: "memo_no", label: "Memo No." },
  { field: "memo_date", label: "Memo Date" },
  { field: "invoice_no", label: "Invoice No." },
  { field: "invoice_date", label: "Invoice Date" },
  { field: "receiving_status", label: "Receipt Status" },
  { field: "receiving_date", label: "Receiving Date" },
  { field: "amount_received", label: "Amount Received" },
  { field: "pending_amount", label: "Pending Amount" },
  { field: "remarks", label: "Remarks" },
  { field: "accounts_remark", label: "Remark Accounts Team" }
];
const importHeaderAliases: Partial<Record<BillingField, string[]>> = {
  amount: ["Professional Fee", "Professional Fees", "Amount"],
  billing_status: ["Billing Status", "Billing"],
  include_ope_in_fees: ["Include OPE in Professional Fees", "Include OPE in Fee"],
  poc_email: ["POC Email", "SPOC Email"],
  poc_mobile: ["POC Mobile", "SPOC Mobile"],
  poc_name: ["POC Name", "POC", "SPOC Name", "SPOC"],
  receiving_status: ["Receipt Status", "Receiving Status", "Receiving"],
  voucher_type: ["Voucher Type", "Voucher"]
};
const importActionColumn = "Import Action";
const importActionOptions = ["Add", "Update", "Delete"];
const billingImportBatchSize = 100;
const billingPageSize = 100;
const accountsOnlyFields = new Set<BillingField>([
  "invoice_date",
  "invoice_no",
  "memo_date",
  "memo_no",
  "receiving_date",
  "receiving_status",
  "amount_received",
  "accounts_remark"
]);

export function BillingRegister() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataHydratedRef = useRef(false);
  const [access, setAccess] = useState<AccessScope>({ canEditAccountsFields: false, canManageMasters: false, canViewAll: false, role: "", team: "" });
  const [addDraft, setAddDraft] = useState<BillingRecord | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [clientRecords, setClientRecords] = useState<ClientRegisterRow[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultBillingColumnOrder);
  const [hasLoadedColumnLayout, setHasLoadedColumnLayout] = useState(false);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(() => new Set());
  const [frozenColumnKeys, setFrozenColumnKeys] = useState<Set<string>>(() => new Set());
  const [editDraft, setEditDraft] = useState<BillingRecord | null>(null);
  const [inlineEditor, setInlineEditor] = useState<InlineEditor | null>(null);
  const inlineEditorValueRef = useRef<string>("");
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isColumnOptionsOpen, setIsColumnOptionsOpen] = useState(false);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [isRowHistoryLoading, setIsRowHistoryLoading] = useState(false);
  const [rowHistoryLogs, setRowHistoryLogs] = useState<AuditLog[] | null>(null);
  const [isFullTableLoading, setIsFullTableLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [matters, setMatters] = useState<GstatMatter[]>([]);
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [savingCell, setSavingCell] = useState<InlineEditor | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [trashRecords, setTrashRecords] = useState<TrashRecord[]>([]);
  const [viewMode, setViewMode] = useState<BillingView>("register");
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [taskCodes, setTaskCodes] = useState<string[]>([]);
  const [isToolbarMenuOpen, setIsToolbarMenuOpen] = useState(false);
  const [activeBillingGroup, setActiveBillingGroup] = useState("core");
  const [filters, setFilters] = useState({ search: "", status: "", receiptStatus: "", team: "", source: "" });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [columnFilterResetKey, setColumnFilterResetKey] = useState(0);
  const [showMarkedForReviewOnly, setShowMarkedForReviewOnly] = useState(false);
  const columnFilterTimersRef = useRef<Record<string, number>>({});
  const [valueFilters, setValueFilters] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<{ field: BillingColumn["field"]; direction: "asc" | "desc" } | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ column: BillingColumn; left: number; bottom: number } | null>(null);
  const filterOptions = useMemo(() => filterMenu
    ? Array.from(new Set(records.map((record) => getBillingFilterValue(record, filterMenu.column, matters)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    : [], [filterMenu, records, matters]);
  // Client names from the Client Records register, for the Client dropdown in
  // the create/edit dialog (picking one autofills GSTIN and Group).
  const clientNameOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const row of clientRecords) {
      const name = getClientName(row);
      const key = normalizeClientName(name);
      if (key && !unique.has(key)) {
        unique.set(key, name);
      }
    }
    return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [clientRecords]);
  const [masters, setMasters] = useState(defaultMasters);

  const mergedMasters = useMemo(
    () => {
      const merged = Object.entries(defaultMasters).reduce<Record<string, string[]>>((result, [key, defaults]) => {
        result[key] = Array.from(new Set([...defaults, ...(masters[key] ?? [])].filter(Boolean)));
        return result;
      }, {});
      merged.task_code = taskCodes;
      return merged;
    },
    [masters, taskCodes]
  );
  const orderedBillingColumns = useMemo(
    () =>
      columnOrder
        .map((columnKey) => billingColumnByKey.get(columnKey))
        .filter((column): column is BillingColumn => Boolean(column)),
    [columnOrder]
  );
  const activeBillingGroupColumnSet = useMemo(() => {
    const group = billingColumnGroups.find((item) => item.key === activeBillingGroup);
    return group?.columns ? new Set(group.columns) : null;
  }, [activeBillingGroup]);
  const visibleBillingColumns = useMemo(
    () => orderedBillingColumns.filter(
      (column) =>
        (column.field === "actions" || !hiddenColumnKeys.has(String(column.field))) &&
        (!activeBillingGroupColumnSet || activeBillingGroupColumnSet.has(String(column.field)))
    ),
    [activeBillingGroupColumnSet, hiddenColumnKeys, orderedBillingColumns]
  );
  const frozenLefts = useMemo(() => {
    const map = new Map<string, number>();
    let accumulated = 0;
    for (const column of visibleBillingColumns) {
      if (frozenColumnKeys.has(String(column.field))) {
        map.set(String(column.field), accumulated);
        accumulated += column.width;
      }
    }
    return map;
  }, [frozenColumnKeys, visibleBillingColumns]);
  const visibleTableWidth = useMemo(
    () => visibleBillingColumns.reduce((total, column) => total + column.width, 0),
    [visibleBillingColumns]
  );
  const filteredRecords = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return records.filter((record) => {
      const matchesSearch =
        !search ||
        [
          record.client,
          record.gstin,
          record.description,
          record.invoice_no,
          record.memo_no,
          record.owner_team,
          record.source_module,
          record.pushed_by,
          record.billing_status,
          record.receiving_status,
          getMatterLabel(record, matters)
        ].some((value) => String(value ?? "").toLowerCase().includes(search));

      // Apply every typed column filter, including ones on columns that were
      // hidden afterwards — otherwise a hidden column's filter still counts as
      // active but silently stops narrowing the rows.
      const matchesColumnFilters = Object.entries(columnFilters).every(([field, rawFilter]) => {
        const filter = String(rawFilter ?? "").trim().toLowerCase();
        const column = billingColumnByKey.get(field);

        if (!filter || !column || column.field === "actions") {
          return true;
        }

        return getDisplayValue(record, column, matters).toLowerCase().includes(filter);
      });

      return (
        matchesSearch &&
        matchesColumnFilters &&
        Object.entries(valueFilters).every(([field, values]) => {
          const column = billingColumnByKey.get(field);
          return !column || values.includes(getBillingFilterValue(record, column, matters));
        }) &&
        (!showMarkedForReviewOnly || String(record.billing_status ?? "").trim().toLowerCase() === "marked for review") &&
        (!filters.status || record.billing_status === filters.status) &&
        (!filters.receiptStatus || record.receiving_status === filters.receiptStatus) &&
        (!filters.team || record.owner_team === filters.team) &&
        (!filters.source || record.source_module === filters.source)
      );
    }).sort((first, second) => {
      if (!sort) return 0;
      const column = billingColumnByKey.get(String(sort.field));
      if (!column || column.field === "actions") return 0;
      const a = getBillingFilterValue(first, column, matters);
      const b = getBillingFilterValue(second, column, matters);
      // Keep empty cells last in either direction.
      if (!a || !b) return a ? -1 : b ? 1 : 0;
      let compared: number;
      if (column.field !== "gstat_link" && (column.type === "money" || column.field === "serial_no" || column.field === "version_no")) {
        compared = toNumber(first[column.field]) - toNumber(second[column.field]);
      } else if (column.type === "date" && column.field !== "gstat_link") {
        // Stored dates can be ISO (imports) or dd-mm-yyyy (inline edits):
        // normalize both to ISO so the comparison is chronological.
        compared = normalizeDateInput(first[column.field]).localeCompare(normalizeDateInput(second[column.field]));
      } else {
        compared = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      }
      return sort.direction === "asc" ? compared : -compared;
    });
  }, [columnFilters, valueFilters, sort, filters, matters, records, showMarkedForReviewOnly]);
  function applyValueFilter(values: string[] | undefined) {
    if (!filterMenu) return;
    const field = String(filterMenu.column.field);
    setValueFilters((current) => {
      const next = { ...current };
      // Nothing ticked means "no filter" rather than "hide every row".
      if (values === undefined || !values.length) delete next[field];
      else next[field] = values;
      return next;
    });

    // Picking values replaces any typed text filter on the column: cancel its
    // pending debounce and remount the input so the stale text disappears too.
    window.clearTimeout(columnFilterTimersRef.current[field]);

    if (String(columnFilters[field] ?? "").trim()) {
      setColumnFilters((current) => ({ ...current, [field]: "" }));
      setColumnFilterResetKey((current) => current + 1);
    }

    setFilterMenu(null);
  }

  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedAuditLogs = selectedRecordId
    ? rowHistoryLogs ?? auditLogs.filter((log) => log.entity_id === selectedRecordId)
    : auditLogs.slice(0, 12);
  const billingSummary = useMemo(() => getBillingSummary(filteredRecords), [filteredRecords]);
  const markedForReviewCount = useMemo(
    () => records.filter((record) => String(record.billing_status ?? "").trim().toLowerCase() === "marked for review").length,
    [records]
  );
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim()) || Object.keys(valueFilters).length > 0;
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / billingPageSize));
  const pagedRecords = useMemo(() => {
    const startIndex = (tablePage - 1) * billingPageSize;
    return filteredRecords.slice(startIndex, startIndex + billingPageSize);
  }, [filteredRecords, tablePage]);
  const pageStart = filteredRecords.length ? (tablePage - 1) * billingPageSize + 1 : 0;
  const pageEnd = Math.min(tablePage * billingPageSize, filteredRecords.length);

  useEffect(() => {
    void loadBilling();
    void loadBillingActivity();
    // Warm the client lookup so the create/edit dialog opens with the Client
    // dropdown already populated.
    void loadClientRecords();
    const cachedTaskCodes = getCached<{ codes?: string[] }>("billing:task-codes:v1");
    if (cachedTaskCodes && Array.isArray(cachedTaskCodes.codes)) {
      setTaskCodes(cachedTaskCodes.codes);
    }
    fetch("/api/taskline?view=codes", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { codes: [] }))
      .then((result: { codes?: { code: string }[] }) => {
        const codes = (result.codes ?? []).map((item) => item.code).filter(Boolean);
        setTaskCodes(codes);
        setCached("billing:task-codes:v1", { codes });
      })
      .catch(() => undefined);
    const savedLayout = getSavedBillingColumnLayout();
    setColumnOrder(savedLayout.order);
    setHiddenColumnKeys(new Set(savedLayout.hiddenColumnKeys));
    setFrozenColumnKeys(new Set(savedLayout.frozenColumnKeys));
    setHasLoadedColumnLayout(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedColumnLayout) {
      return;
    }

    saveBillingColumnLayout({
      frozenColumnKeys: Array.from(frozenColumnKeys),
      hiddenColumnKeys: Array.from(hiddenColumnKeys),
      order: columnOrder
    });
  }, [columnOrder, frozenColumnKeys, hasLoadedColumnLayout, hiddenColumnKeys]);

  useEffect(() => {
    setTablePage(1);
  }, [columnFilters, valueFilters, sort, filters.receiptStatus, filters.search, filters.source, filters.status, filters.team]);

  useEffect(() => {
    setTablePage((currentPage) => Math.min(currentPage, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setAddDraft((currentDraft) =>
      currentDraft ? enrichBillingRecord(currentDraft, clientRecords, currentDraft.client ? "client" : undefined) : currentDraft
    );
    setEditDraft((currentDraft) =>
      currentDraft ? enrichBillingRecord(currentDraft, clientRecords, currentDraft.client ? "client" : undefined) : currentDraft
    );
  }, [clientRecords]);

  async function loadClientRecords() {
    if (clientRecords.length) {
      return clientRecords;
    }

    // Cache-first so the Client dropdown is populated the moment the dialog
    // opens; a background refresh keeps the list current.
    const cached = getCached<{ rows?: ClientRegisterRow[] }>(clientRecordsCacheKey);
    if (cached?.rows?.length) {
      setClientRecords(cached.rows);
      void refreshClientRecords();
      return cached.rows;
    }

    return refreshClientRecords();
  }

  async function refreshClientRecords() {
    try {
      const response = await fetch("/api/client-records/managed", { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as { rows?: ClientRegisterRow[] };

      if (response.ok) {
        const rows = result.rows ?? [];
        setClientRecords(rows);
        setCached(clientRecordsCacheKey, { rows });
        return rows;
      }
    } catch (error) {
      console.error("Billing client lookup load failed:", error);
    }

    return clientRecords;
  }

  async function loadBilling() {
    const cached = !dataHydratedRef.current
      ? getCached<{ access?: AccessScope; masters?: Record<string, string[]>; matters?: GstatMatter[]; records?: BillingRecord[] }>("billing")
      : undefined;
    dataHydratedRef.current = true;

    if (cached) {
      setIsAccessDenied(false);
      if (cached.access) {
        setAccess(cached.access);
      }
      setMasters({ ...defaultMasters, ...(cached.masters ?? {}) });
      setMatters(cached.matters ?? []);
      setRecords((cached.records ?? []).map(normalizeRecord));
      setIsLoading(false);
      void loadFullBilling();
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/billing?scope=register&fast=1", { cache: "no-store" });
      const result = (await response.json()) as {
        access?: AccessScope;
        error?: string;
        masters?: Record<string, string[]>;
        matters?: GstatMatter[];
        records?: BillingRecord[];
      };

      if (!response.ok) {
        if (response.status === 403) {
          setIsAccessDenied(true);
          setRecords([]);
          setAuditLogs([]);
          setTrashRecords([]);
        }
        setMessage(result.error ?? "Could not load billing register.");
        return;
      }

      setIsAccessDenied(false);
      setAccess(result.access ?? access);
      setMasters({ ...defaultMasters, ...(result.masters ?? {}) });
      setMatters(result.matters ?? []);
      setRecords((result.records ?? []).map(normalizeRecord));
      void loadFullBilling();
    } catch (error) {
      console.error("Billing load error:", error);
      setMessage("Could not load billing register.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadFullBilling() {
    setIsFullTableLoading(true);

    try {
      const response = await fetch("/api/billing?scope=register", { cache: "no-store" });
      const result = (await response.json()) as {
        access?: AccessScope;
        error?: string;
        masters?: Record<string, string[]>;
        matters?: GstatMatter[];
        records?: BillingRecord[];
      };

      if (!response.ok) {
        console.error("Full billing load failed:", result.error);
        return;
      }

      setAccess(result.access ?? access);
      setMasters({ ...defaultMasters, ...(result.masters ?? {}) });
      setMatters(result.matters ?? []);
      setRecords((result.records ?? []).map(normalizeRecord));
      setCached("billing", {
        access: result.access ?? access,
        masters: result.masters,
        matters: result.matters,
        records: result.records
      });
    } catch (error) {
      console.error("Full billing load error:", error);
    } finally {
      setIsFullTableLoading(false);
    }
  }

  async function loadBillingActivity() {
    setIsActivityLoading(true);

    try {
      const response = await fetch("/api/billing?scope=activity", { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as {
        auditLogs?: AuditLog[];
        error?: string;
        trashRecords?: TrashRecord[];
      };

      if (!response.ok) {
        console.error("Billing activity load failed:", result.error);
        return;
      }

      setAuditLogs(result.auditLogs ?? []);
      setTrashRecords(result.trashRecords ?? []);
    } catch (error) {
      console.error("Billing activity load error:", error);
    } finally {
      setIsActivityLoading(false);
    }
  }

  function openAddForm() {
    void loadClientRecords();
    setAddDraft(enrichBillingRecord({
      ...emptyRecord,
      owner_team: access.team,
      source_module: "manual"
    }, clientRecords));
    setMessage("");
  }

  function updateAddDraft(field: BillingField, rawValue: string) {
    if (!clientRecords.length && (field === "gstin" || field === "client")) {
      void loadClientRecords();
    }

    setAddDraft((currentDraft) =>
      currentDraft
        ? enrichBillingRecord(prepareRecordUpdate(currentDraft, field, rawValue), clientRecords, field)
        : currentDraft
    );
  }

  function openEditForm(record: BillingRecord) {
    void loadClientRecords();
    setInlineEditor(null);
    setEditDraft(enrichBillingRecord(normalizeRecord(record), clientRecords));
    setMessage("");
  }

  function updateEditDraft(field: BillingField, rawValue: string) {
    if (!clientRecords.length && (field === "gstin" || field === "client")) {
      void loadClientRecords();
    }

    setEditDraft((currentDraft) =>
      currentDraft
        ? enrichBillingRecord(prepareRecordUpdate(currentDraft, field, rawValue), clientRecords, field)
        : currentDraft
    );
  }

  async function createAddDraft() {
    if (!addDraft) {
      return;
    }

    setMessage("Creating billing row...");

    try {
      const saved = await saveRecord(enrichBillingRecord(addDraft, clientRecords));
      setRecords((currentRecords) => [normalizeRecord(saved), ...currentRecords]);
      setAddDraft(null);
      setMessage("Billing row added.");
      void loadBilling();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add billing row.");
    }
  }

  async function saveInlineEditor(valueOverride?: string) {
    if (!inlineEditor || savingCell) {
      return;
    }

    const record = records.find((item) => item.id === inlineEditor.recordId);

    if (!record) {
      setInlineEditor(null);
      return;
    }

    const rawValue = valueOverride ?? inlineEditorValueRef.current;
    const nextRecord = enrichBillingRecord(
      prepareRecordUpdate(record, inlineEditor.field, rawValue),
      clientRecords,
      inlineEditor.field
    );

    if (String(record[inlineEditor.field] ?? "") === String(nextRecord[inlineEditor.field] ?? "")) {
      setInlineEditor(null);
      return;
    }

    setSavingCell(inlineEditor);
    setInlineEditor(null);
    setRecords((currentRecords) =>
      currentRecords.map((item) => (item.id === record.id ? nextRecord : item))
    );

    try {
      const saved = normalizeRecord(await saveRecord(nextRecord));
      setRecords((currentRecords) =>
        currentRecords.map((item) => (item.id === saved.id ? saved : item))
      );
      setMessage(`Saved ${getColumnLabel(inlineEditor.field)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save billing cell.");
      await loadBilling();
    } finally {
      setSavingCell(null);
    }
  }

  function startInlineEdit(record: BillingRecord, field: BillingField, value: string) {
    inlineEditorValueRef.current = value;
    setInlineEditor({ field, recordId: record.id!, value });
  }

  function handleEditorChange(value: string) {
    inlineEditorValueRef.current = value;
  }

  function openRowHistory(record: BillingRecord) {
    // Opens as a full audit view (same as a task's audit trail in TaskLine)
    // rather than a pop-up.
    setSelectedRecordId(record.id ?? null);
    setRowHistoryLogs(null);
    setViewMode("audit");

    if (record.id) {
      void loadRowHistory(record.id);
    }
  }

  // The row panel fetches the record's COMPLETE billing audit trail from the
  // server (the global activity feed only holds the latest entries overall,
  // so older rows used to show an empty history).
  async function loadRowHistory(recordId: string) {
    setIsRowHistoryLoading(true);

    try {
      const response = await fetch(`/api/billing?scope=activity&recordId=${encodeURIComponent(recordId)}`, { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as { auditLogs?: AuditLog[]; error?: string };

      if (!response.ok) {
        console.error("Billing row history load failed:", result.error);
        return;
      }

      setRowHistoryLogs(result.auditLogs ?? []);
    } catch (error) {
      console.error("Billing row history load error:", error);
    } finally {
      setIsRowHistoryLoading(false);
    }
  }

  async function saveDirectField(record: BillingRecord, field: BillingField, rawValue: string) {
    let nextRecord = enrichBillingRecord(prepareRecordUpdate(record, field, rawValue), clientRecords, field);

    if (field === "gstat_appeal_id") {
      const matter = matters.find((item) => item.id === rawValue);

      nextRecord = {
        ...nextRecord,
        client: matter?.client || nextRecord.client,
        description: matter?.matter_description || nextRecord.description,
        gstin: matter?.gstin || nextRecord.gstin,
        owner_team: access.canViewAll ? matter?.owner_team || nextRecord.owner_team : nextRecord.owner_team
      };
      nextRecord = enrichBillingRecord(nextRecord, clientRecords, "gstin");
    }

    setRecords((currentRecords) =>
      currentRecords.map((item) => (item.id === record.id ? nextRecord : item))
    );

    try {
      const saved = normalizeRecord(await saveRecord(nextRecord));
      setRecords((currentRecords) =>
        currentRecords.map((item) => (item.id === saved.id ? saved : item))
      );
      setMessage(`Saved ${getColumnLabel(field)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save billing cell.");
      await loadBilling();
    }
  }

  async function saveRecord(record: BillingRecord) {
    const response = await fetch("/api/billing", {
      body: JSON.stringify({ record }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { error?: string; latest?: BillingRecord; record?: BillingRecord };

    if (response.status === 409 && result.latest) {
      const latest = normalizeRecord(result.latest);
      setRecords((currentRecords) =>
        currentRecords.map((item) => (item.id === latest.id ? latest : item))
      );
    }

    if (!response.ok || !result.record) {
      throw new Error(result.error ?? "Could not save billing record.");
    }

    return result.record;
  }

  async function deleteRecord(record: BillingRecord) {
    if (!record.id || !window.confirm(`Delete billing record for ${record.client || record.invoice_no || "this row"}?`)) {
      return;
    }

    setMessage("Deleting billing row...");
    const response = await fetch(`/api/billing?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(result.error ?? "Could not delete billing row.");
      return;
    }

    setRecords((currentRecords) => currentRecords.filter((item) => item.id !== record.id));
    setSelectedRecordId((current) => (current === record.id ? null : current));
    setMessage("Billing row moved to trash.");
    void loadBillingActivity();
  }

  async function saveEditDraft() {
    if (!editDraft) {
      return;
    }

    setMessage("Saving billing row...");

    try {
      const saved = normalizeRecord(await saveRecord(enrichBillingRecord(editDraft, clientRecords)));
      setRecords((currentRecords) =>
        currentRecords.map((item) => (item.id === saved.id ? saved : item))
      );
      setEditDraft(null);
      setMessage("Billing row updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update billing row.");
    }
  }

  async function restoreTrashRecord(row: TrashRecord) {
    const client = String(row.data.client || row.data.invoice_no || "this billing row");

    if (!window.confirm(`Restore ${client} to Billing Register?`)) {
      return;
    }

    setMessage("Restoring billing row...");
    const response = await fetch("/api/billing", {
      body: JSON.stringify({ action: "restore", trashId: row.id }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as {
      auditLogs?: AuditLog[];
      error?: string;
      records?: BillingRecord[];
      trashRecords?: TrashRecord[];
    };

    if (!response.ok) {
      setMessage(result.error ?? "Could not restore billing row.");
      return;
    }

    setAuditLogs(result.auditLogs ?? []);
    setRecords((result.records ?? []).map(normalizeRecord));
    setTrashRecords(result.trashRecords ?? []);
    setMessage("Billing row restored.");
  }

  async function importWorkbook(file: File) {
    const lookupRows = clientRecords.length ? clientRecords : await loadClientRecords();
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    // Same guard as the other registers: refuse files whose headings do not
    // match the template / exported sheet, with a clear message.
    if (rows.length) {
      const headers = new Set(Object.keys(rows[0]).map((key) => key.trim().toLowerCase()));
      const hasIdentity = ["billing id", "client", "gstin", "task code"].some((header) => headers.has(header));
      if (!headers.has(importActionColumn.toLowerCase()) || !hasIdentity) {
        setMessage(`Could not find the "${importActionColumn}" and "Client"/"GSTIN" headers in ${file.name}. Use Download template or an exported billing sheet.`);
        return;
      }
    }

    const billingRows = rows.map((row) => {
      const record = { ...emptyRecord };
      const importedRecord = record as unknown as Record<BillingField, unknown>;
      const importAction = normalizeImportAction(row[importActionColumn]);

      importHeaders.forEach(({ field, label }) => {
        const value = getImportCellValue(row, field, label);
        importedRecord[field] = isDateField(field) ? normalizeDateInput(value) : value;
      });

      record.source_module = "import";
      return {
        ...enrichBillingRecord(recalc(record), lookupRows, "gstin"),
        import_action: importAction
      };
    }).filter((row) => row.id || row.serial_no || row.client || row.description || row.invoice_no);

    if (!billingRows.length) {
      setMessage(`No billing rows found in ${file.name}.`);
      return;
    }

    setMessage(`Importing ${billingRows.length} billing rows from ${file.name}...`);

    const summary = emptyImportSummary();

    try {
      for (let index = 0; index < billingRows.length; index += billingImportBatchSize) {
        const batch = billingRows.slice(index, index + billingImportBatchSize);
        const result = await postBillingImportBatch(batch);
        mergeImportSummary(summary, result.importSummary);
        setMessage(`Importing ${file.name}: ${Math.min(index + billingImportBatchSize, billingRows.length)} of ${billingRows.length} rows processed...`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import billing rows.");
      return;
    }

    await loadBilling();
    void loadBillingActivity();
    setMessage(formatImportSummary(file.name, billingRows.length, summary));
  }

  function exportWorkbook(scope: "full" | "view") {
    const exportRecords = scope === "full" ? records : filteredRecords;
    const rows = exportRecords.map((record, index) => ({
      [importActionColumn]: "Update",
      "Billing ID": record.id ?? "",
      "S.No.": record.serial_no ?? index + 1,
      Team: record.owner_team,
      "Task Code": record.task_code ?? "",
      "Pushed From Sheet": formatSourceModule(record.source_module),
      "Pushed By": record.pushed_by ?? "",
      "Voucher Type": record.voucher_type,
      Group: record.group_name,
      GSTIN: record.gstin,
      Client: record.client,
      "Place of Supply": record.place_of_supply,
      Address: record.address,
      "Registration Type": record.registration_type,
      "Escalation 1": record.escalation_1,
      "SPOC Name": record.poc_name,
      "SPOC Mobile": record.poc_mobile,
      "SPOC Email": record.poc_email,
      Description: record.description,
      Amount: record.amount,
      CGST: record.cgst,
      SGST: record.sgst,
      IGST: record.igst,
      OPE: record.ope,
      "Include OPE in Professional Fees": record.include_ope_in_fees,
      "OPE Remarks": record.ope_remarks,
      Total: record.total,
      "Billing Status": record.billing_status,
      "Memo No.": record.memo_no,
      "Memo Date": formatDateForExport(record.memo_date),
      "Invoice No.": record.invoice_no,
      "Invoice Date": formatDateForExport(record.invoice_date),
      "Receipt Status": record.receiving_status,
      "Receiving Date": formatDateForExport(record.receiving_date),
      "Amount Received": record.amount_received,
      "Pending Amount": record.pending_amount,
      Remarks: record.remarks,
      "Remark Accounts Team": record.accounts_remark ?? "",
      "GSTAT Link": getMatterLabel(record, matters)
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [blankExportRow()]);

    worksheet["!cols"] = Object.keys(rows.length ? rows[0] : blankExportRow()).map(() => ({ wch: 18 }));
    addImportActionDropdown(worksheet, Math.max(rows.length + 100, 500));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Firm Billing");
    XLSX.writeFile(workbook, scope === "full" ? "workline-firm-billing-full-table.xlsx" : "workline-firm-billing-current-view.xlsx");
    setMessage(`Exported ${exportRecords.length} billing rows from ${scope === "full" ? "full table" : "current view"}.`);
  }

  function downloadTemplate() {
    const worksheet = XLSX.utils.json_to_sheet([importHeaders.reduce<Record<string, string>>((row, header) => {
      row[importActionColumn] = row[importActionColumn] || "Add";
      row[header.label] = "";
      return row;
    }, {})]);
    worksheet["!cols"] = [importActionColumn, ...importHeaders.map((header) => header.label)].map(() => ({ wch: 20 }));
    addImportActionDropdown(worksheet, 500);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Billing Import");
    XLSX.writeFile(workbook, "workline-billing-import-template.xlsx");
  }

  if (isAccessDenied) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
        {message || "Billing is not available for your role."}
      </section>
    );
  }

  return (
    <section className={`w-full border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)] ${isFullscreen ? "fixed inset-3 z-50 flex flex-col overflow-hidden rounded-lg" : "rounded-lg"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-slate-950">
          Billing Register{viewMode === "audit" ? (selectedRecordId ? " — Row Audit Trail" : " — Audit Trail") : viewMode === "trash" ? ` — Trash (${trashRecords.length})` : ""}
          {isFullTableLoading ? <span className="ml-2 text-xs font-bold text-slate-400">loading…</span> : null}
        </h2>
        <div className="relative">
          <button className={buttonClass("dark")} onClick={() => setIsToolbarMenuOpen((current) => !current)} type="button">
            <Menu className="size-4" />
            Actions
          </button>
          {isToolbarMenuOpen ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setIsToolbarMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-2xl">
                {viewMode !== "register" ? (
                  <BillingMenuItem icon={RotateCcw} label="Register" onClick={() => { setIsToolbarMenuOpen(false); setSelectedRecordId(null); setRowHistoryLogs(null); setViewMode("register"); }} />
                ) : null}
                <BillingMenuItem icon={History} label="Audit Trail" onClick={() => { setIsToolbarMenuOpen(false); setSelectedRecordId(null); setRowHistoryLogs(null); setViewMode("audit"); void loadBillingActivity(); }} />
                <BillingMenuItem icon={Trash2} label={`Trash (${trashRecords.length})`} onClick={() => { setIsToolbarMenuOpen(false); setViewMode("trash"); void loadBillingActivity(); }} />
                <div className="my-1 border-t border-slate-100" />
                <BillingMenuItem icon={Plus} label="Add row" onClick={() => { setIsToolbarMenuOpen(false); openAddForm(); }} />
                <BillingMenuItem icon={Settings2} label="Columns" onClick={() => { setIsToolbarMenuOpen(false); setIsColumnOptionsOpen(true); }} />
                <BillingMenuItem icon={Download} label="Export view" onClick={() => { setIsToolbarMenuOpen(false); exportWorkbook("view"); }} />
                <BillingMenuItem icon={Download} label="Export full" onClick={() => { setIsToolbarMenuOpen(false); exportWorkbook("full"); }} />
                <BillingMenuItem icon={Download} label="Download template" onClick={() => { setIsToolbarMenuOpen(false); downloadTemplate(); }} />
                <BillingMenuItem icon={Upload} label="Import" onClick={() => { setIsToolbarMenuOpen(false); fileInputRef.current?.click(); }} />
                <BillingMenuItem icon={Maximize2} label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={() => { setIsToolbarMenuOpen(false); setIsFullscreen((current) => !current); }} />
                {hasActiveColumnFilters ? (
                  <BillingMenuItem icon={X} label="Clear column filters" onClick={() => { setIsToolbarMenuOpen(false); Object.values(columnFilterTimersRef.current).forEach((timer) => window.clearTimeout(timer)); columnFilterTimersRef.current = {}; setColumnFilters({}); setValueFilters({}); setColumnFilterResetKey((current) => current + 1); }} />
                ) : null}
              </div>
            </>
          ) : null}
          {isColumnOptionsOpen ? (
            <BillingColumnOptionsPanel
              frozenColumnKeys={frozenColumnKeys}
              hiddenColumnKeys={hiddenColumnKeys}
              onApply={(layout) => {
                const normalizedLayout = normalizeBillingColumnLayout(layout);
                setColumnOrder(normalizedLayout.order);
                setHiddenColumnKeys(new Set(normalizedLayout.hiddenColumnKeys));
                setFrozenColumnKeys(new Set(normalizedLayout.frozenColumnKeys));
                setIsColumnOptionsOpen(false);
              }}
              onClose={() => setIsColumnOptionsOpen(false)}
              orderedColumns={orderedBillingColumns}
            />
          ) : null}
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
        </div>
      </div>

      {viewMode === "register" ? (
        <div className="mt-4">
          <button
            className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-black text-slate-700 transition hover:bg-slate-100"
            onClick={() => setIsSummaryOpen((current) => !current)}
            type="button"
          >
            <span>Summary — {billingSummary.rowCount} rows · {formatMoney(billingSummary.total)}</span>
            <ChevronDown className={`size-4 shrink-0 text-slate-500 transition ${isSummaryOpen ? "rotate-180" : ""}`} />
          </button>
          {isSummaryOpen ? (
            <BillingSummaryPanel
              activeBillingStatus={filters.status}
              activeReceiptStatus={filters.receiptStatus}
              onFilterReceiptStatus={(receiptStatus) => setFilters((current) => ({ ...current, receiptStatus: current.receiptStatus === receiptStatus ? "" : receiptStatus }))}
              onFilterStatus={(status) => setFilters((current) => ({ ...current, status: current.status === status ? "" : status }))}
              summary={billingSummary}
            />
          ) : null}
        </div>
      ) : null}

      {viewMode === "register" ? (
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search className="size-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search client, GSTIN, invoice, memo, team"
            value={filters.search}
          />
        </label>
        <button
          className={buttonClass("light")}
          onClick={() => {
            Object.values(columnFilterTimersRef.current).forEach((timer) => window.clearTimeout(timer));
            columnFilterTimersRef.current = {};
            setFilters({ search: "", status: "", receiptStatus: "", team: "", source: "" });
            setColumnFilters({});
            setValueFilters({});
            setColumnFilterResetKey((current) => current + 1);
            setSort(null);
            setFilterMenu(null);
          }}
          type="button"
        >
          <X className="size-4" />
          Clear filters / sorting
        </button>
      </div>
      ) : null}

      {message ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
          {message}
        </p>
      ) : null}

      {viewMode === "register" ? (
      <div className={`mt-4 ${isFullscreen ? "flex min-h-0 flex-1 flex-col" : ""}`}>
        <div className="mb-2 flex flex-col gap-2 text-sm font-bold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {pageStart}-{pageEnd} of {filteredRecords.length} matching billing rows
          </p>
          <div className="flex items-center gap-2">
            <label
              className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-black uppercase transition ${
                showMarkedForReviewOnly ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              title="Show only bills whose Billing status is Marked for Review"
            >
              <input
                checked={showMarkedForReviewOnly}
                className="accent-amber-600"
                onChange={(event) => {
                  setShowMarkedForReviewOnly(event.target.checked);
                  setTablePage(1);
                }}
                type="checkbox"
              />
              Mark for Review
              {markedForReviewCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-black text-white">
                  {markedForReviewCount}
                </span>
              ) : null}
            </label>
            <button
              className={buttonClass("light")}
              disabled={tablePage <= 1}
              onClick={() => setTablePage((currentPage) => Math.max(1, currentPage - 1))}
              type="button"
            >
              Previous
            </button>
            <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-600">
              Page {tablePage} of {pageCount}
            </span>
            <button
              className={buttonClass("light")}
              disabled={tablePage >= pageCount}
              onClick={() => setTablePage((currentPage) => Math.min(pageCount, currentPage + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
        {filterMenu ? <BillingColumnFilter
          key={String(filterMenu.column.field)}
          label={filterMenu.column.label}
          anchor={filterMenu}
          options={filterOptions}
          selected={valueFilters[String(filterMenu.column.field)]}
          onApply={applyValueFilter}
          onClose={() => setFilterMenu(null)}
          onSort={(direction) => { setSort(direction ? { field: filterMenu.column.field, direction } : null); setFilterMenu(null); }}
        /> : null}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {billingColumnGroups.map((group) => (
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                activeBillingGroup === group.key
                  ? "bg-navy-700 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              key={group.key}
              onClick={() => setActiveBillingGroup(group.key)}
              type="button"
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className={`overflow-auto rounded-md border border-slate-200 bg-white ${isFullscreen ? "min-h-0 flex-1" : "max-h-[calc(100vh-190px)]"}`}>
          <table className="table-fixed border-collapse text-left text-sm" style={{ minWidth: visibleTableWidth, width: visibleTableWidth }}>
            <colgroup>
              {visibleBillingColumns.map((column) => (
                <col key={column.field} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
              <tr>
                {visibleBillingColumns.map((column) => {
                  const frozenLeft = frozenLefts.get(String(column.field));
                  return (
                  <th className={`border-r border-white/10 px-3 py-3 last:border-r-0 ${frozenLeft !== undefined ? "sticky z-20 bg-slate-100" : ""}`} style={frozenLeft !== undefined ? { left: frozenLeft } : undefined} key={column.field} aria-sort={sort?.field === column.field ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                    <div className="flex items-center justify-between gap-1">
                      <span>{column.label}</span>
                      {column.field !== "actions" ? <div className="flex shrink-0 items-center gap-1">
                        <button type="button" aria-label={`Sort ${column.label}`} title="Click to cycle ascending, descending and default order" onClick={() => setSort((current) => current?.field !== column.field ? { field: column.field, direction: "asc" } : current.direction === "asc" ? { field: column.field, direction: "desc" } : null)}>
                          {sort?.field === column.field ? (sort.direction === "asc" ? <ArrowUp className="size-4 text-navy-700" /> : <ArrowDown className="size-4 text-navy-700" />) : <ArrowUpDown className="size-4 text-slate-400" />}
                        </button>
                        <button type="button" aria-label={`Choose filter values for ${column.label}`} aria-haspopup="dialog" className={`rounded border p-0.5 ${valueFilters[String(column.field)] !== undefined ? "border-navy-500 bg-navy-100 text-navy-700" : "border-slate-200 bg-white text-slate-500"}`} onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          setFilterMenu({ column, left: rect.left, bottom: rect.bottom });
                        }}><Filter className="size-3.5" /></button>
                      </div> : null}
                    </div>
                  </th>
                  );
                })}
              </tr>
              <tr className="bg-slate-50">
                {visibleBillingColumns.map((column) => {
                  const frozenLeft = frozenLefts.get(String(column.field));
                  return (
                  <th className={`border-r border-slate-200 px-2 py-2 last:border-r-0 ${frozenLeft !== undefined ? "sticky z-20 bg-slate-50" : ""}`} style={frozenLeft !== undefined ? { left: frozenLeft } : undefined} key={`filter-${column.field}`}>
                    {column.field === "actions" ? null : (
                      <input
                        aria-label={`Filter ${column.label}`}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold normal-case text-slate-950 outline-none focus:border-navy-400"
                        defaultValue={columnFilters[String(column.field)] ?? ""}
                        key={`${columnFilterResetKey}-${column.field}`}
                        onChange={(event) => {
                          const filterKey = String(column.field);
                          const filterValue = event.target.value;
                          window.clearTimeout(columnFilterTimersRef.current[filterKey]);
                          columnFilterTimersRef.current[filterKey] = window.setTimeout(() => {
                            setColumnFilters((current) => ({ ...current, [filterKey]: filterValue }));
                          }, 250);
                        }}
                        placeholder="Filter"
                      />
                    )}
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={visibleBillingColumns.length}><LoadingIndicator label="Loading billing rows..." /></td></tr>
              ) : filteredRecords.length ? (
                pagedRecords.map((record, rowIndex) => (
                  <BillingRow
                    access={access}
                    columns={visibleBillingColumns}
                    frozenLefts={frozenLefts}
                    inlineEditor={inlineEditor}
                    key={record.id}
                    masters={mergedMasters}
                    matters={matters}
                    onDelete={deleteRecord}
                    onDirectSave={saveDirectField}
                    onEdit={startInlineEdit}
                    onEditForm={openEditForm}
                    onEditorChange={handleEditorChange}
                    onHistory={openRowHistory}
                    onSave={saveInlineEditor}
                    record={record}
                    savingCell={savingCell}
                    serialNumber={pageStart + rowIndex}
                  />
                ))
              ) : (
                <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={visibleBillingColumns.length}>No billing rows match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {viewMode === "audit" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3">
            <History className="size-4 text-rose-700" />
            <div className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">
                {selectedRecordId
                  ? selectedRecord?.client || selectedRecord?.invoice_no || selectedRecord?.memo_no || "Billing row"
                  : "Billing Audit Trail"}
              </h3>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
                {selectedRecordId
                  ? "Billing updates only, from the moment this row was pushed to Billing. The task's earlier journey lives in its TaskLine audit trail."
                  : "The latest changes across the whole Billing register."}
              </p>
            </div>
            <button
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              onClick={() => { setSelectedRecordId(null); setRowHistoryLogs(null); setViewMode("register"); }}
              type="button"
            >
              <RotateCcw className="size-3.5" />
              Back to register
            </button>
          </div>
          <BillingAuditTable
            logs={selectedRecordId ? selectedAuditLogs : auditLogs}
            isLoading={selectedRecordId ? isRowHistoryLoading : isActivityLoading}
          />
        </>
      ) : null}

      {viewMode === "trash" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3">
            <Trash2 className="size-4 text-rose-700" />
            <div className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">Billing Trash</h3>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">Deleted billing rows stay restorable here for 30 days.</p>
            </div>
            <button
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              onClick={() => setViewMode("register")}
              type="button"
            >
              <RotateCcw className="size-3.5" />
              Back to register
            </button>
          </div>
          <BillingTrashTable isLoading={isActivityLoading} onRestore={restoreTrashRecord} rows={trashRecords} />
        </>
      ) : null}

      {addDraft ? (
        <BillingAddForm
          access={access}
          clientOptions={clientNameOptions}
          draft={addDraft}
          masters={mergedMasters}
          mode="create"
          onChange={updateAddDraft}
          onClose={() => setAddDraft(null)}
          onSubmit={createAddDraft}
        />
      ) : null}

      {editDraft ? (
        <BillingAddForm
          access={access}
          clientOptions={clientNameOptions}
          draft={editDraft}
          masters={mergedMasters}
          mode="edit"
          onChange={updateEditDraft}
          onClose={() => setEditDraft(null)}
          onSubmit={saveEditDraft}
        />
      ) : null}

    </section>
  );
}

type BillingRowProps = {
  access: AccessScope;
  columns: BillingColumn[];
  frozenLefts: Map<string, number>;
  inlineEditor: InlineEditor | null;
  masters: Record<string, string[]>;
  matters: GstatMatter[];
  onDelete: (record: BillingRecord) => void;
  onDirectSave: (record: BillingRecord, field: BillingField, value: string) => void;
  onEdit: (record: BillingRecord, field: BillingField, value: string) => void;
  onEditForm: (record: BillingRecord) => void;
  onEditorChange: (value: string) => void;
  onHistory: (record: BillingRecord) => void;
  onSave: (valueOverride?: string) => void;
  record: BillingRecord;
  savingCell: InlineEditor | null;
  serialNumber: number;
};

function rowEditorKey(editor: InlineEditor | null, recordId: string | undefined) {
  return editor && editor.recordId === recordId ? `${editor.field}:${editor.value}` : "";
}

// Rows re-render only when their own data or their own editing state changes,
// so typing in a cell or a filter no longer re-renders the whole grid.
function billingRowPropsEqual(previous: BillingRowProps, next: BillingRowProps) {
  return (
    previous.record === next.record &&
    previous.columns === next.columns &&
    previous.frozenLefts === next.frozenLefts &&
    previous.masters === next.masters &&
    previous.matters === next.matters &&
    previous.access === next.access &&
    previous.serialNumber === next.serialNumber &&
    rowEditorKey(previous.inlineEditor, previous.record.id) === rowEditorKey(next.inlineEditor, next.record.id) &&
    rowEditorKey(previous.savingCell, previous.record.id) === rowEditorKey(next.savingCell, next.record.id)
  );
}

const BillingRow = memo(function BillingRow({
  access,
  columns,
  frozenLefts,
  inlineEditor,
  masters,
  matters,
  onDelete,
  onDirectSave,
  onEdit,
  onEditForm,
  onEditorChange,
  onHistory,
  onSave,
  record,
  savingCell,
  serialNumber
}: BillingRowProps) {
  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      {columns.map((column) => (
        <BillingCell
          access={access}
          column={column}
          frozenLeft={frozenLefts.get(String(column.field))}
          inlineEditor={inlineEditor}
          key={`${record.id}-${column.field}`}
          masters={masters}
          matters={matters}
          onDelete={() => onDelete(record)}
          onEdit={(field, value) => onEdit(record, field, value)}
          onEditForm={() => onEditForm(record)}
          onEditorChange={onEditorChange}
          onHistory={() => onHistory(record)}
          onDirectSave={(field, value) => onDirectSave(record, field, value)}
          onSave={onSave}
          record={record}
          savingCell={savingCell}
          serialNumber={serialNumber}
        />
      ))}
    </tr>
  );
}, billingRowPropsEqual);

function BillingCell({
  access,
  column,
  frozenLeft,
  inlineEditor,
  masters,
  matters,
  onDelete,
  onEdit,
  onEditForm,
  onEditorChange,
  onHistory,
  onDirectSave,
  onSave,
  record,
  savingCell,
  serialNumber
}: {
  access: AccessScope;
  column: BillingColumn;
  frozenLeft?: number;
  inlineEditor: InlineEditor | null;
  masters: Record<string, string[]>;
  matters: GstatMatter[];
  onDelete: () => void;
  onEdit: (field: BillingField, value: string) => void;
  onEditForm: () => void;
  onEditorChange: (value: string) => void;
  onHistory: () => void;
  onDirectSave: (field: BillingField, value: string) => void;
  onSave: (valueOverride?: string) => void;
  record: BillingRecord;
  savingCell: InlineEditor | null;
  serialNumber: number;
}) {
  const isActions = column.field === "actions";
  const isGstatLink = column.field === "gstat_link";
  const field = column.field as BillingField;
  const isAccountsOnly = accountsOnlyFields.has(field);
  const frozenTdClass = frozenLeft !== undefined ? "sticky z-[4] bg-white" : "";
  const frozenTdStyle = frozenLeft !== undefined ? { left: frozenLeft } : undefined;
  const receiptStatus = String(record.receiving_status ?? "").trim().toLowerCase();
  const receiptIsAuto =
    receiptStatus === "" || receiptStatus === "pending" || receiptStatus === "received" || receiptStatus === "realised" || receiptStatus === "realized";
  const isReadOnly =
    column.field === "serial_no" ||
    column.field === "source_module" ||
    column.field === "pushed_by" ||
    column.field === "total" ||
    column.field === "pending_amount" ||
    (column.field === "amount_received" && receiptIsAuto) ||
    (!access.canViewAll && column.field === "owner_team") ||
    (isAccountsOnly && !access.canEditAccountsFields);
  const isEditing = Boolean(inlineEditor && inlineEditor.recordId === record.id && inlineEditor.field === field);
  const isSaving = Boolean(savingCell && savingCell.recordId === record.id && savingCell.field === field);
  const editorValue = isEditing ? inlineEditor?.value ?? "" : "";
  const displayValue =
    column.field === "serial_no" ? String(record.task_code ?? "").trim() || String(serialNumber) : getDisplayValue(record, column, matters);

  if (isActions) {
    return (
      <td className={`border-r border-slate-100 px-3 py-2 last:border-r-0 ${frozenTdClass}`} style={frozenTdStyle}>
        <div className="flex items-center gap-1">
          <button
            className="inline-flex size-8 items-center justify-center rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50"
            onClick={onEditForm}
            title="Edit billing row"
            type="button"
          >
            <Pencil className="size-4" />
          </button>
          <button
            className="inline-flex size-8 items-center justify-center rounded-md border border-navy-200 text-navy-700 hover:bg-navy-50"
            onClick={onHistory}
            title="View row history"
            type="button"
          >
            <History className="size-4" />
          </button>
        </div>
      </td>
    );
  }

  if (isGstatLink) {
    const currentLabel = getMatterLabel(record, matters);

    return (
      <td className={`border-r border-slate-100 px-2 py-2 last:border-r-0 ${frozenTdClass}`} style={frozenTdStyle}>
        <label className="flex items-center gap-2">
          <Link2 className="size-4 shrink-0 text-slate-400" />
          <select
            className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold outline-none"
            onChange={(event) => onDirectSave("gstat_appeal_id", event.target.value)}
            value={record.gstat_appeal_id ?? ""}
          >
            <option value="">{currentLabel ? "Unlink GSTAT matter" : "Manual billing"}</option>
            {matters.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.label}
              </option>
            ))}
          </select>
        </label>
      </td>
    );
  }

  return (
    <td className={`border-r border-slate-100 px-2 py-2 font-semibold text-slate-700 last:border-r-0 ${frozenTdClass}`} style={frozenTdStyle}>
      {isEditing && column.type === "select" ? (
        <select
          autoFocus
          className="h-8 w-full rounded-md border border-navy-300 bg-white px-2 text-xs font-bold outline-none ring-2 ring-navy-100"
          onBlur={() => onSave()}
          defaultValue={editorValue}
          onChange={(event) => {
            onEditorChange(event.target.value);
            onSave(event.target.value);
          }}
        >
          {selectOptions(field, masters).map((option) => (
            <option key={option} value={option}>{option || "-"}</option>
          ))}
        </select>
      ) : isEditing ? (
        <input
          autoFocus
          className="h-8 w-full rounded-md border border-navy-300 bg-white px-2 text-xs font-bold outline-none ring-2 ring-navy-100"
          onBlur={() => onSave()}
          onChange={(event) => onEditorChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSave();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onEditorChange(String(record[field] ?? ""));
              onSave(String(record[field] ?? ""));
            }
          }}
          defaultValue={editorValue}
          placeholder={column.type === "date" ? "dd-mm-yyyy" : undefined}
          type={column.type === "money" ? "number" : "text"}
        />
      ) : (
        <button
          className={`block w-full min-w-0 rounded px-1.5 text-left ${
            field === "client" ? "min-h-8 whitespace-normal break-words py-1 leading-tight" : "h-8 truncate"
          } ${isReadOnly ? "cursor-default" : "cursor-text hover:bg-slate-50 hover:ring-1 hover:ring-navy-200"}`}
          disabled={isReadOnly || isSaving}
          onClick={() => {
            if (!isReadOnly && record.id) {
              onEdit(field, column.type === "date" ? formatDateForInput(record[field]) : String(record[field] ?? ""));
            }
          }}
          title={String(displayValue || "")}
          type="button"
        >
          {isSaving ? "Saving..." : displayValue || "-"}
        </button>
      )}
    </td>
  );
}

function BillingAddForm({
  access,
  clientOptions,
  draft,
  masters,
  mode,
  onChange,
  onClose,
  onSubmit
}: {
  access: AccessScope;
  clientOptions: string[];
  draft: BillingRecord;
  masters: Record<string, string[]>;
  mode: "create" | "edit";
  onChange: (field: BillingField, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isEdit = mode === "edit";
  // Stable options identity so the client picker doesn't re-render its whole
  // list every time a field in the draft changes.
  const clientSelectOptions = useMemo(() => clientOptions.map((value) => ({ value, label: value })), [clientOptions]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-700/45 px-4 py-6">
      <section className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.30)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-navy-700">
              {isEdit ? "Edit billing record" : "New billing record"}
            </p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">
              {isEdit ? "Edit Billing Entry" : "Create Billing Entry"}
            </h3>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {isEdit ? "Update this billing row in one place. Cell editing remains available in the table." : "Pick a client from Client Records or enter GSTIN first — GSTIN, group, POS and registration type fill automatically."}
            </p>
          </div>
          <button
            className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            title="Close form"
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className="text-[10px] font-black uppercase text-slate-500">Task Code</span>
              <select
                className={formControlClass}
                onChange={(event) => onChange("task_code", event.target.value)}
                value={draft.task_code || ""}
              >
                <option value="">Select task code</option>
                {selectOptions("task_code", masters).filter(Boolean).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                {draft.task_code && !selectOptions("task_code", masters).includes(draft.task_code) ? (
                  <option value={draft.task_code}>{draft.task_code}</option>
                ) : null}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase text-slate-500">Voucher Type</span>
              <select
                className={formControlClass}
                onChange={(event) => onChange("voucher_type", event.target.value)}
                value={draft.voucher_type}
              >
                {selectOptions("voucher_type", masters).filter(Boolean).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <FormInput field="gstin" label="GSTIN" onChange={onChange} value={draft.gstin} />
            <label>
              <span className="text-[10px] font-black uppercase text-slate-500">Client</span>
              <SearchableSelect
                allowCustom
                onChange={(value) => onChange("client", value)}
                options={clientSelectOptions}
                placeholder="Select client"
                value={draft.client}
              />
            </label>
            <FormInput field="place_of_supply" label="Place of Supply" onChange={onChange} value={draft.place_of_supply} />
            <FormInput field="registration_type" label="Registration Type" onChange={onChange} value={draft.registration_type} />
            <FormInput field="address" label="Address" onChange={onChange} value={draft.address} wide />
            <FormInput field="escalation_1" label="Escalation 1" onChange={onChange} value={draft.escalation_1} />
            <FormInput field="group_name" label="Group" onChange={onChange} value={draft.group_name} />
            <FormInput field="description" label="Description" onChange={onChange} value={draft.description} wide />
            <FormInput field="amount" label="Professional Fee" onChange={onChange} type="number" value={String(draft.amount || "")} />
            <FormInput field="ope" label="OPE" onChange={onChange} type="number" value={String(draft.ope || "")} />
            <label>
              <span className="text-[10px] font-black uppercase text-slate-500">Include OPE in Fee</span>
              <select
                className={formControlClass}
                onChange={(event) => onChange("include_ope_in_fees", event.target.value)}
                value={draft.include_ope_in_fees || "No"}
              >
                <option>No</option>
                <option>Yes</option>
              </select>
            </label>
            <FormInput field="ope_remarks" label="OPE Remarks" onChange={onChange} value={draft.ope_remarks} />
            <FormInput field="cgst" label="CGST" onChange={onChange} readOnly type="number" value={String(draft.cgst || 0)} />
            <FormInput field="sgst" label="SGST" onChange={onChange} readOnly type="number" value={String(draft.sgst || 0)} />
            <FormInput field="igst" label="IGST" onChange={onChange} readOnly type="number" value={String(draft.igst || 0)} />
            <FormInput field="total" label="Total" onChange={onChange} readOnly type="number" value={String(draft.total || 0)} />
            <FormInput field="memo_no" label="Memo No." onChange={onChange} readOnly={!access.canEditAccountsFields} value={draft.memo_no} />
            <FormInput field="memo_date" label="Memo Date" onChange={onChange} placeholder="dd-mm-yyyy" readOnly={!access.canEditAccountsFields} value={formatDateForInput(draft.memo_date)} />
            <FormInput field="invoice_no" label="Invoice No." onChange={onChange} readOnly={!access.canEditAccountsFields} value={draft.invoice_no} />
            <FormInput field="invoice_date" label="Invoice Date" onChange={onChange} placeholder="dd-mm-yyyy" readOnly={!access.canEditAccountsFields} value={formatDateForInput(draft.invoice_date)} />
            <label>
              <span className="text-[10px] font-black uppercase text-slate-500">Receipt Status</span>
              <select
                className={formControlClass}
                onChange={(event) => onChange("receiving_status", event.target.value)}
                disabled={!access.canEditAccountsFields}
                value={draft.receiving_status}
              >
                {selectOptions("receiving_status", masters).filter(Boolean).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <FormInput field="receiving_date" label="Receipt Date" onChange={onChange} placeholder="dd-mm-yyyy" readOnly={!access.canEditAccountsFields} value={formatDateForInput(draft.receiving_date)} />
            <FormInput field="remarks" label="Remarks" onChange={onChange} value={draft.remarks} wide />
            <FormInput field="accounts_remark" label="Remark Accounts Team" onChange={onChange} readOnly={!access.canEditAccountsFields} value={draft.accounts_remark} wide />
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4">
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

function FormInput({
  field,
  label,
  onChange,
  placeholder,
  readOnly = false,
  type = "text",
  value,
  wide = false
}: {
  field: BillingField;
  label: string;
  onChange: (field: BillingField, value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: "number" | "text";
  value: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="text-[10px] font-black uppercase text-slate-500">{label}</span>
      <input
        className={`${formControlClass} ${readOnly ? "bg-slate-50 text-slate-600" : ""}`}
        min={type === "number" ? "0" : undefined}
        onChange={(event) => onChange(field, event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        type={type}
        value={value}
      />
    </label>
  );
}

const formControlClass = "mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-navy-300 focus:ring-2 focus:ring-navy-100";

function BillingSummaryPanel({
  activeBillingStatus,
  activeReceiptStatus,
  onFilterReceiptStatus,
  onFilterStatus,
  summary
}: {
  activeBillingStatus: string;
  activeReceiptStatus: string;
  onFilterReceiptStatus: (status: string) => void;
  onFilterStatus: (status: string) => void;
  summary: ReturnType<typeof getBillingSummary>;
}) {
  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/40 p-3">
      <div className="grid gap-3 xl:grid-cols-[260px_1fr_1fr]">
        <div className="rounded-xl bg-gradient-to-br from-[#1e3168] to-[#101a3a] p-4 text-white shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">Summary</p>
          <p className="mt-2 text-3xl font-black leading-none">{summary.rowCount}</p>
          <p className="mt-1 text-xs font-bold text-white/70">visible billing row{summary.rowCount === 1 ? "" : "s"}</p>
          <div className="mt-4 rounded-lg bg-white/10 px-3 py-2">
            <p className="text-lg font-black leading-tight">{formatMoney(summary.total)}</p>
            <p className="text-[11px] font-bold text-white/70">total billing value</p>
          </div>
        </div>
        <SummaryGroup activeLabel={activeBillingStatus} items={summary.billingStatus} onSelect={onFilterStatus} title="Billing Status" />
        <SummaryGroup activeLabel={activeReceiptStatus} items={summary.receivingStatus} onSelect={onFilterReceiptStatus} title="Receipt Status" />
      </div>
    </section>
  );
}

function billingSummaryAccent(label: string) {
  const value = label.toLowerCase();
  if (value.includes("receiv") || value.includes("recie") || value.includes("raise") || value.includes("done") || value.includes("realis")) {
    return "#10b981";
  }
  if (value.includes("pending")) {
    return "#f97316";
  }
  if (value.includes("hold")) {
    return "#f59e0b";
  }
  if (value.includes("cancel") || value.includes("merged")) {
    return "#f43f5e";
  }
  if (value.includes("revis")) {
    return "#0ea5e9";
  }
  if (value.includes("credit")) {
    return "#8b5cf6";
  }
  if (value.includes("draft") || value === "na" || value.includes("na /")) {
    return "#94a3b8";
  }
  return "#6366f1";
}

function SummaryGroup({
  activeLabel = "",
  items,
  onSelect,
  title
}: {
  activeLabel?: string;
  items: Array<{ amount: number; count: number; label: string }>;
  onSelect?: (label: string) => void;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <div className="mt-2 grid gap-1.5">
        {items.length ? items.slice(0, 8).map((item) => {
          const isActive = Boolean(onSelect && activeLabel === item.label);
          const accent = billingSummaryAccent(item.label);

          return (
          <button
            aria-pressed={onSelect ? isActive : undefined}
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border-l-4 py-1.5 pl-2 pr-2 text-left transition ${
              isActive ? "bg-slate-100" : onSelect ? "hover:bg-slate-50" : "cursor-default"
            }`}
            disabled={!onSelect}
            key={item.label}
            onClick={() => onSelect?.(item.label)}
            style={{ borderLeftColor: accent, backgroundColor: isActive ? undefined : `${accent}0f` }}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
              <span className="min-w-0 truncate text-xs font-black text-slate-700">{item.label || "Not set"}</span>
            </span>
            <span className="shrink-0 text-xs font-black" style={{ color: accent }}>
              {item.count} <span className="font-bold text-slate-400">/</span> {formatMoney(item.amount)}
            </span>
          </button>
        );
        }) : (
          <p className="py-3 text-xs font-bold text-slate-500">No rows.</p>
        )}
      </div>
    </div>
  );
}

function BillingMenuItem({ icon: Icon, label, onClick }: { icon: ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
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

function BillingColumnOptionsPanel({
  frozenColumnKeys,
  hiddenColumnKeys,
  onApply,
  onClose,
  orderedColumns
}: {
  frozenColumnKeys: Set<string>;
  hiddenColumnKeys: Set<string>;
  onApply: (layout: BillingColumnLayout) => void;
  onClose: () => void;
  orderedColumns: BillingColumn[];
}) {
  const [draftOrder, setDraftOrder] = useState<string[]>(() => orderedColumns.map((column) => String(column.field)));
  const [draftHiddenColumnKeys, setDraftHiddenColumnKeys] = useState<Set<string>>(() => new Set(hiddenColumnKeys));
  const [draftFrozenColumnKeys, setDraftFrozenColumnKeys] = useState<Set<string>>(() => new Set(frozenColumnKeys));

  function toggleDraftFrozen(column: BillingColumn) {
    const columnKey = String(column.field);
    setDraftFrozenColumnKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(columnKey)) {
        nextKeys.delete(columnKey);
      } else {
        nextKeys.add(columnKey);
      }
      return nextKeys;
    });
  }
  const draftColumns = useMemo(
    () =>
      draftOrder
        .map((columnKey) => billingColumnByKey.get(columnKey))
        .filter((column): column is BillingColumn => Boolean(column)),
    [draftOrder]
  );
  const visibleCount = useMemo(
    () => draftColumns.filter((column) => column.field === "actions" || !draftHiddenColumnKeys.has(String(column.field))).length,
    [draftColumns, draftHiddenColumnKeys]
  );

  function toggleDraftColumn(column: BillingColumn) {
    if (column.field === "actions") {
      return;
    }

    setDraftHiddenColumnKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      const columnKey = String(column.field);

      if (nextKeys.has(columnKey)) {
        nextKeys.delete(columnKey);
      } else {
        nextKeys.add(columnKey);
      }

      return nextKeys;
    });
  }

  function moveDraftColumn(column: BillingColumn, direction: "up" | "down") {
    setDraftOrder((currentOrder) => {
      const columnKey = String(column.field);
      const currentIndex = currentOrder.indexOf(columnKey);

      if (currentIndex < 0) {
        return currentOrder;
      }

      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (nextIndex < 0 || nextIndex >= currentOrder.length) {
        return currentOrder;
      }

      const nextOrder = [...currentOrder];
      [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
      return nextOrder;
    });
  }

  return (
    <div className="absolute right-0 top-12 z-[80] max-w-[calc(100vw-2rem)] w-[360px] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div>
          <p className="text-xs font-black uppercase text-slate-950">Column Options</p>
          <p className="text-[11px] font-bold text-slate-500">{visibleCount} visible columns</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-black uppercase text-slate-700 transition hover:bg-slate-50"
            onClick={() => {
              setDraftOrder(defaultBillingColumnOrder);
              setDraftHiddenColumnKeys(new Set());
              setDraftFrozenColumnKeys(new Set());
            }}
            type="button"
          >
            Reset
          </button>
          <button
            aria-label="Close column options"
            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-2">
        {draftColumns.map((column, index) => {
          const columnKey = String(column.field);
          const isActions = column.field === "actions";
          const isHidden = !isActions && draftHiddenColumnKeys.has(columnKey);

          return (
            <div
              className={`mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-2 ${
                isHidden ? "border-slate-200 bg-slate-50 text-slate-500" : "border-slate-200 bg-white text-slate-950"
              }`}
              key={columnKey}
            >
              <label className={`flex min-w-0 items-center gap-2 ${isActions ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}>
                <input
                  checked={!isHidden}
                  className="size-4 accent-slate-950"
                  disabled={isActions}
                  onChange={() => toggleDraftColumn(column)}
                  type="checkbox"
                />
                <span className="min-w-0 truncate text-xs font-black" title={column.label}>
                  {column.label}
                </span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  aria-label={`${draftFrozenColumnKeys.has(columnKey) ? "Unfreeze" : "Freeze"} ${column.label}`}
                  className={`inline-flex size-7 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-35 ${
                    draftFrozenColumnKeys.has(columnKey)
                      ? "border-navy-600 bg-navy-600 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                  disabled={isHidden}
                  onClick={() => toggleDraftFrozen(column)}
                  title={draftFrozenColumnKeys.has(columnKey) ? "Unfreeze column" : "Freeze column (keep visible while scrolling)"}
                  type="button"
                >
                  <Pin className="size-3.5" />
                </button>
                <button
                  aria-label={`Move ${column.label} up`}
                  className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={index === 0}
                  onClick={() => moveDraftColumn(column, "up")}
                  type="button"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  aria-label={`Move ${column.label} down`}
                  className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={index === draftColumns.length - 1}
                  onClick={() => moveDraftColumn(column, "down")}
                  type="button"
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
        <button className={buttonClass("light")} onClick={onClose} type="button">Cancel</button>
        <button
          className={buttonClass("dark")}
          onClick={() => onApply({ frozenColumnKeys: Array.from(draftFrozenColumnKeys), hiddenColumnKeys: Array.from(draftHiddenColumnKeys), order: draftOrder })}
          type="button"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function BillingAuditTable({ isLoading, logs }: { isLoading: boolean; logs: AuditLog[] }) {
  return (
    <div className="mt-4 overflow-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-[1180px] border-separate border-spacing-0 text-left text-xs">
        <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
          <tr>
            {["Time", "Action", "Updated By", "Team", "Client", "Changed Data"].map((heading) => (
              <th className="border-b border-r border-white/15 px-3 py-3 font-black" key={heading}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const oldValue = log.old_value ?? {};
            const newValue = log.new_value ?? {};
            const summary = { ...oldValue, ...newValue };
            const changes = getAuditChanges(log);

            return (
              <tr className="odd:bg-white even:bg-slate-50/80" key={log.id}>
                <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{formatDateTime(log.created_at)}</td>
                <td className="border-b border-r border-slate-200 px-3 py-2 font-black text-slate-900">{formatBillingAuditAction(log.action)}</td>
                <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{log.actor_name || "Unknown user"}</td>
                <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{summary.owner_team ?? "-"}</td>
                <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{summary.client ?? "-"}</td>
                <td className="max-w-xl border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                  {changes.length ? (
                    <div className="space-y-1">
                      {changes.map((change) => (
                        <p className="text-xs" key={change.field}>
                          <span className="font-black text-slate-950">{change.label}:</span>{" "}
                          <span className="text-slate-500">{change.oldValue || "-"}</span>
                          <span className="px-1 text-slate-400">to</span>
                          <span className="text-slate-900">{change.newValue || "-"}</span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">No field-level change captured.</span>
                  )}
                </td>
              </tr>
            );
          })}
          {!logs.length ? (
            <tr>
              <td className="px-3 py-8 text-center text-sm font-bold text-slate-500" colSpan={6}>
                {isLoading
                  ? <LoadingIndicator label="Loading billing history..." />
                  : <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" /> No billing audit entries found.</span>}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function BillingTrashTable({
  isLoading,
  onRestore,
  rows
}: {
  isLoading: boolean;
  onRestore: (row: TrashRecord) => void;
  rows: TrashRecord[];
}) {
  return (
    <div className="mt-4 overflow-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-[1120px] border-separate border-spacing-0 text-left text-xs">
        <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
          <tr>
            {["Deleted", "Expires", "Action", "Team", "Client", "GSTIN", "Amount", "Restore"].map((heading) => (
              <th className="border-b border-r border-white/15 px-3 py-3 font-black" key={heading}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="odd:bg-white even:bg-slate-50/80" key={row.id}>
              <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{formatDateTime(row.deleted_at)}</td>
              <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{formatDate(row.expires_at)}</td>
              <td className="border-b border-r border-slate-200 px-3 py-2 font-black text-slate-900">{row.delete_action}</td>
              <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{row.data.owner_team || "-"}</td>
              <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{row.data.client || "-"}</td>
              <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{row.data.gstin || "-"}</td>
              <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">{formatMoney(String(row.data.total ?? 0))}</td>
              <td className="border-b border-r border-slate-200 px-3 py-2">
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-black uppercase text-emerald-800 transition hover:bg-emerald-100"
                  onClick={() => onRestore(row)}
                  type="button"
                >
                  <RotateCcw className="size-3.5" />
                  Restore
                </button>
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td className="px-3 py-8 text-center text-sm font-bold text-slate-500" colSpan={8}>
                {isLoading
                  ? <LoadingIndicator label="Loading trash..." />
                  : <span className="inline-flex items-center gap-2"><Trash2 className="size-4" /> No deleted billing rows are currently in trash.</span>}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function prepareRecordUpdate(record: BillingRecord, field: BillingField, rawValue: string): BillingRecord {
  const nextRecord = {
    ...record,
    [field]: isMoneyField(field) ? toNumber(rawValue) : rawValue
  };
  const linkedMatter = field === "gstat_appeal_id" ? rawValue : record.gstat_appeal_id;

  return recalc({
    ...nextRecord,
    gstat_appeal_id: linkedMatter || null,
    source_module: linkedMatter ? "gstat" : nextRecord.source_module === "gstat" ? "manual" : nextRecord.source_module
  });
}

function enrichBillingRecord(record: BillingRecord, clientRecords: ClientRegisterRow[], changedField?: BillingField): BillingRecord {
  let working = record;

  // Picking a client from Client Records fills its GSTIN and Group; the GSTIN
  // match below then cascades the address, POS and registration type.
  if (changedField === "client") {
    const clientByName = findClientByName(record.client, clientRecords);
    if (clientByName) {
      working = {
        ...record,
        group_name: getClientGroup(clientByName) || record.group_name,
        gstin: getFirstValue(clientByName, gstinKeys) || record.gstin
      };
    }
  }

  const matchedClient = findClientByGstin(working.gstin, clientRecords);
  const placeOfSupply = changedField === "place_of_supply"
    ? working.place_of_supply
    : stateFromGstin(working.gstin) || working.place_of_supply;
  const ope = toNumber(working.ope);
  const taxBase = getTaxBase(toNumber(working.amount), ope, working.include_ope_in_fees);
  const tax = calculateTax(taxBase, placeOfSupply);

  return recalc({
    ...working,
    address: changedField === "address" ? working.address : getClientAddress(matchedClient) || working.address,
    cgst: tax.cgst,
    client: changedField === "client" ? working.client : getClientName(matchedClient) || working.client,
    group_name: changedField === "group_name" ? working.group_name : working.group_name || getClientGroup(matchedClient),
    igst: tax.igst,
    place_of_supply: placeOfSupply,
    registration_type: getRegistrationType(matchedClient) || working.registration_type,
    sgst: tax.sgst
  });
}

function normalizeRecord(record: BillingRecord): BillingRecord {
  return recalc({
    ...emptyRecord,
    ...record,
    amount: toNumber(record.amount),
    cgst: toNumber(record.cgst),
    igst: toNumber(record.igst),
    include_ope_in_fees: yesNo(record.include_ope_in_fees),
    ope: toNumber(record.ope),
    place_of_supply: record.place_of_supply || stateFromGstin(record.gstin),
    serial_no: record.serial_no ? Number(record.serial_no) : undefined,
    sgst: toNumber(record.sgst),
    total: toNumber(record.total),
    version_no: Number(record.version_no ?? 1)
  });
}

function recalc(record: BillingRecord): BillingRecord {
  const total = toNumber(record.amount) + toNumber(record.cgst) + toNumber(record.sgst) + toNumber(record.igst) + toNumber(record.ope);
  const status = String(record.receiving_status ?? "").trim().toLowerCase();
  let amountReceived: number;
  let pendingAmount: number;
  if (status === "received" || status === "realised" || status === "realized") {
    amountReceived = total;
    pendingAmount = 0;
  } else if (status === "" || status === "pending") {
    amountReceived = 0;
    pendingAmount = total;
  } else {
    // Part Received / any other status: use the manually entered received amount.
    amountReceived = Math.min(Math.max(0, toNumber(record.amount_received)), total);
    pendingAmount = Math.max(0, total - amountReceived);
  }
  return {
    ...record,
    amount_received: amountReceived,
    pending_amount: pendingAmount,
    total
  };
}

function getBillingFilterValue(record: BillingRecord, column: BillingColumn, matters: GstatMatter[]) {
  if (column.field !== "gstat_link" && column.field !== "actions") {
    const raw = record[column.field];
    if (raw === null || raw === undefined || String(raw).trim() === "") return "";
  }
  return getDisplayValue(record, column, matters).trim();
}

function getDisplayValue(record: BillingRecord, column: BillingColumn, matters: GstatMatter[]) {
  if (column.field === "gstat_link") {
    return getMatterLabel(record, matters);
  }

  if (column.field === "actions") {
    return "";
  }

  const value = record[column.field];

  if (column.field === "source_module") {
    return formatSourceModule(value);
  }

  if (column.type === "money" || column.field === "total") {
    return formatMoney(value as number);
  }

  if (column.type === "date") {
    return formatDate(String(value ?? ""));
  }

  return String(value ?? "");
}

function formatSourceModule(value: unknown) {
  const source = String(value ?? "").trim().toLowerCase();

  if (source === "gstat") {
    return "GSTAT";
  }

  if (source === "taskline") {
    return "TaskLine";
  }

  if (source === "import") {
    return "Billing Import";
  }

  if (source === "manual") {
    return "Manual Billing";
  }

  return String(value ?? "").trim();
}

function getBillingSummary(records: BillingRecord[]) {
  return {
    billingStatus: summarizeBy(records, (record) => record.billing_status || "Not set"),
    receivingStatus: summarizeBy(records, (record) => record.receiving_status || "Not set"),
    rowCount: records.length,
    sources: summarizeBy(records, (record) => record.source_module || "manual"),
    total: records.reduce((sum, record) => sum + toNumber(record.total), 0)
  };
}

function summarizeBy(records: BillingRecord[], getKey: (record: BillingRecord) => string) {
  const groups = new Map<string, { amount: number; count: number; label: string }>();

  records.forEach((record) => {
    const label = getKey(record);
    const current = groups.get(label) ?? { amount: 0, count: 0, label };
    current.amount += toNumber(record.total);
    current.count += 1;
    groups.set(label, current);
  });

  return Array.from(groups.values()).sort((first, second) => second.count - first.count || first.label.localeCompare(second.label));
}

function getMatterLabel(record: BillingRecord, matters: GstatMatter[]) {
  return matters.find((matter) => matter.id === record.gstat_appeal_id)?.label ?? "";
}

function getColumnLabel(field: BillingField) {
  if (field === "gstat_appeal_id") {
    return "GSTAT Link";
  }

  return billingColumns.find((column) => column.field === field)?.label ?? field;
}

function isMoneyField(field: BillingField) {
  return ["amount", "cgst", "sgst", "igst", "ope", "total"].includes(field);
}

function isDateField(field: BillingField) {
  return ["invoice_date", "memo_date", "receiving_date"].includes(field);
}

function selectOptions(field: BillingField, masters: Record<string, string[]>) {
  if (field === "source_module") {
    return ["manual", "gstat", "taskline", "import"];
  }

  if (field === "include_ope_in_fees") {
    return ["No", "Yes"];
  }

  if (field === "is_retainer") {
    return ["", "Retainer", "Regular"];
  }

  return ["", ...(masters[field] ?? [])];
}

function buttonClass(kind: "dark" | "light" | "primary") {
  if (kind === "primary") {
    return "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy-700 px-3 text-sm font-black text-white transition hover:bg-navy-800";
  }

  if (kind === "dark") {
    return "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-navy-700 px-3 text-sm font-black text-white transition hover:bg-navy-800";
  }

  return "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 transition hover:bg-slate-50";
}

function blankExportRow() {
  return importHeaders.reduce<Record<string, string>>((row, header) => {
    row[importActionColumn] = row[importActionColumn] || "Add";
    row[header.label] = "";
    return row;
  }, {});
}

function getImportCellValue(row: Record<string, unknown>, field: BillingField, label: string) {
  const normalizedRow = Object.entries(row).reduce<Record<string, unknown>>((result, [key, value]) => {
    result[normalizeLookupKey(key)] = value;
    return result;
  }, {});
  const keys = [label, field, ...(importHeaderAliases[field] ?? [])];

  for (const key of keys) {
    const value = normalizedRow[normalizeLookupKey(key)];

    if (String(value ?? "").trim()) {
      return value;
    }
  }

  return "";
}

function formatImportSummary(
  fileName: string,
  rowCount: number,
  summary?: { added: number; deleted: number; skippedDeletes: number; skippedUpdates: number; updated: number }
) {
  if (!summary) {
    return `Processed ${rowCount} billing import rows from ${fileName}.`;
  }

  const skipped = summary.skippedDeletes + summary.skippedUpdates;
  const parts = [
    `Processed ${rowCount} billing import rows from ${fileName}`,
    `${summary.added} added`,
    `${summary.updated} updated`,
    `${summary.deleted} deleted`
  ];

  if (skipped) {
    parts.push(`${skipped} skipped because no matching billing row was found`);
  }

  return `${parts.join(" - ")}.`;
}

function emptyImportSummary() {
  return {
    added: 0,
    deleted: 0,
    skippedDeletes: 0,
    skippedUpdates: 0,
    updated: 0
  };
}

function mergeImportSummary(
  target: ReturnType<typeof emptyImportSummary>,
  source?: Partial<ReturnType<typeof emptyImportSummary>>
) {
  target.added += Number(source?.added ?? 0);
  target.deleted += Number(source?.deleted ?? 0);
  target.skippedDeletes += Number(source?.skippedDeletes ?? 0);
  target.skippedUpdates += Number(source?.skippedUpdates ?? 0);
  target.updated += Number(source?.updated ?? 0);
}

async function postBillingImportBatch(rows: BillingRecord[]) {
  const response = await fetch("/api/billing", {
    body: JSON.stringify({ action: "import", refresh: false, rows }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const body = await response.text();
  const result = safeParseJson<{
    error?: string;
    importSummary?: ReturnType<typeof emptyImportSummary>;
  }>(body);

  if (!response.ok) {
    throw new Error(result.error || body || `Import failed with status ${response.status}.`);
  }

  return result;
}

function safeParseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

function normalizeImportAction(value: unknown) {
  const action = String(value ?? "").trim().toLowerCase();

  if (action === "update") {
    return "Update";
  }

  if (action === "delete") {
    return "Delete";
  }

  return "Add";
}

function addImportActionDropdown(worksheet: XLSX.WorkSheet, rowCount: number) {
  const worksheetWithValidation = worksheet as XLSX.WorkSheet & {
    "!dataValidation"?: Array<Record<string, unknown>>;
  };

  worksheetWithValidation["!dataValidation"] = [
    {
      allowBlank: false,
      formula1: `"${importActionOptions.join(",")}"`,
      sqref: `A2:A${Math.max(rowCount, 2)}`,
      type: "list"
    }
  ];
}

function calculateTax(amount: number, placeOfSupply: string) {
  if (placeOfSupply.trim().toLowerCase() === "rajasthan") {
    return {
      cgst: roundMoney(amount * 0.09),
      igst: 0,
      sgst: roundMoney(amount * 0.09)
    };
  }

  return {
    cgst: 0,
    igst: roundMoney(amount * 0.18),
    sgst: 0
  };
}

function getTaxBase(amount: number, ope: number, includeOpeInFees: string) {
  return yesNo(includeOpeInFees) === "Yes" ? amount + ope : amount;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function yesNo(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "yes" ? "Yes" : "No";
}

function stateFromGstin(value: unknown) {
  const code = String(value ?? "").trim().slice(0, 2);
  return gstStateByCode[code] ?? "";
}

function findClientByGstin(gstin: string, clientRecords: ClientRegisterRow[]) {
  const normalizedGstin = normalizeGstin(gstin);

  if (!normalizedGstin) {
    return null;
  }

  return clientRecords.find((row) => normalizeGstin(getFirstValue(row, gstinKeys)) === normalizedGstin) ?? null;
}

function getClientName(row: ClientRegisterRow | null) {
  return getFirstValue(row, clientNameKeys);
}

function getClientGroup(row: ClientRegisterRow | null) {
  return getFirstValue(row, clientGroupKeys);
}

function findClientByName(name: string, clientRecords: ClientRegisterRow[]) {
  const normalizedName = normalizeClientName(name);

  if (!normalizedName) {
    return null;
  }

  return clientRecords.find((row) => normalizeClientName(getClientName(row)) === normalizedName) ?? null;
}

function normalizeClientName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getRegistrationType(row: ClientRegisterRow | null) {
  return getFirstValue(row, registrationTypeKeys);
}

function getClientAddress(row: ClientRegisterRow | null) {
  return getFirstValue(row, clientAddressKeys);
}

function getSavedBillingColumnLayout(): BillingColumnLayout {
  if (typeof window === "undefined") {
    return { frozenColumnKeys: [], hiddenColumnKeys: [], order: defaultBillingColumnOrder };
  }

  try {
    const savedLayout = window.localStorage.getItem(billingColumnLayoutStorageKey);

    if (!savedLayout) {
      return { frozenColumnKeys: [], hiddenColumnKeys: [], order: defaultBillingColumnOrder };
    }

    return normalizeBillingColumnLayout(JSON.parse(savedLayout) as Partial<BillingColumnLayout>);
  } catch {
    return { frozenColumnKeys: [], hiddenColumnKeys: [], order: defaultBillingColumnOrder };
  }
}

function saveBillingColumnLayout(layout: BillingColumnLayout) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(billingColumnLayoutStorageKey, JSON.stringify(normalizeBillingColumnLayout(layout)));
}

function normalizeBillingColumnLayout(layout: Partial<BillingColumnLayout>): BillingColumnLayout {
  const knownColumnKeys = new Set(defaultBillingColumnOrder);
  const savedOrder = Array.isArray(layout.order) ? layout.order.filter((key) => knownColumnKeys.has(key)) : [];
  const order = pinBillingColumnOrder([...savedOrder, ...defaultBillingColumnOrder.filter((key) => !savedOrder.includes(key))]);
  const hiddenColumnKeys = Array.isArray(layout.hiddenColumnKeys)
    ? layout.hiddenColumnKeys.filter((key) => knownColumnKeys.has(key) && key !== "actions" && key !== "serial_no" && key !== "task_code")
    : [];
  const frozenColumnKeys = Array.isArray(layout.frozenColumnKeys)
    ? layout.frozenColumnKeys.filter((key) => knownColumnKeys.has(key) && !hiddenColumnKeys.includes(key))
    : [];

  return { frozenColumnKeys, hiddenColumnKeys, order };
}

function pinBillingColumnOrder(order: string[]) {
  const withoutPinned = order.filter(
    (key) => !["actions", "address", "place_of_supply", "pushed_by", "serial_no", "task_code"].includes(key)
  );
  const clientIndex = withoutPinned.indexOf("client");
  const insertAt = clientIndex >= 0 ? clientIndex + 1 : 0;

  withoutPinned.splice(insertAt, 0, "place_of_supply", "address");

  // Actions + Task Code are pinned to the front; Pushed By is pinned to the end.
  return ["actions", "task_code", ...withoutPinned, "pushed_by"];
}

function normalizeGstin(value: unknown) {
  return String(value ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase();
}

function getFirstValue(row: ClientRegisterRow | null, keys: string[]) {
  if (!row) {
    return "";
  }

  const normalizedRow = Object.entries(row).reduce<Record<string, string | number>>((result, [key, value]) => {
    result[normalizeLookupKey(key)] = value;
    return result;
  }, {});

  for (const key of keys) {
    const value = normalizedRow[normalizeLookupKey(key)];

    if (String(value ?? "").trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function normalizeLookupKey(key: string) {
  return key.replace(/[^0-9a-z]/gi, "").toLowerCase();
}

const clientRecordsCacheKey = "clients:managed:v1";
const gstinKeys = ["GSTIN/UIN", "GSTIN", "GSTIN No", "GSTIN No.", "GST No", "GST Number", "GSTAT Login ID"];
const clientNameKeys = ["Particulars", "Client", "Client Name", "Name", "Legal Name", "Trade Name"];
const clientAddressKeys = ["Address", "Client Address", "Billing Address", "Registered Address", "Principal Place of Business"];
const registrationTypeKeys = ["Registration Type", "Reg Type", "GST Registration Type", "Registration"];
const clientGroupKeys = ["Group", "Group Name", "Entity Group", "Client Group"];

const auditFields: BillingField[] = [
  "owner_team",
  "source_module",
  "voucher_type",
  "group_name",
  "gstin",
  "client",
  "place_of_supply",
  "registration_type",
  "address",
  "description",
  "amount",
  "cgst",
  "sgst",
  "igst",
  "ope",
  "include_ope_in_fees",
  "ope_remarks",
  "total",
  "billing_status",
  "memo_no",
  "memo_date",
  "invoice_no",
  "invoice_date",
  "receiving_status",
  "receiving_date",
  "remarks",
  "accounts_remark",
  "gstat_appeal_id"
];

function formatBillingAuditAction(action: string) {
  if (action === "billing.create") {
    return "pushed to billing";
  }

  return action.replace("billing.", "").replace(/[._]/g, " ");
}

function getAuditChanges(log: AuditLog): AuditChange[] {
  const oldValue = log.old_value ?? {};
  const newValue = log.new_value ?? {};

  return auditFields
    .map((field) => {
      const oldFieldValue = formatAuditField(field, oldValue[field]);
      const newFieldValue = formatAuditField(field, newValue[field]);
      return {
        field,
        label: getColumnLabel(field),
        newValue: newFieldValue,
        oldValue: oldFieldValue
      };
    })
    .filter((change) => {
      if (log.action === "billing.create") {
        return Boolean(change.newValue);
      }

      if (log.action === "billing.delete") {
        return Boolean(change.oldValue);
      }

      return change.oldValue !== change.newValue;
    });
}

function isDefined(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function formatAuditField(field: BillingField, value: unknown) {
  if (!isDefined(value)) {
    return "";
  }

  if (isMoneyField(field) || field === "total") {
    return formatMoney(String(value));
  }

  if (field.endsWith("_date")) {
    return formatDate(String(value));
  }

  return String(value);
}

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit"
  }).format(date);

  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}, ${time}`;
}

function formatDate(value: string) {
  const normalized = normalizeDateInput(value);

  if (!normalized) {
    return "-";
  }

  const [year, month, day] = normalized.split("-");
  return `${day}-${month}-${year}`;
}

function formatDateForExport(value: unknown) {
  const formatted = formatDate(String(value ?? ""));
  return formatted === "-" ? "" : formatted;
}

function formatDateForInput(value: unknown) {
  const rawValue = String(value ?? "").trim();
  const formatted = formatDate(rawValue);
  return formatted === "-" ? rawValue : formatted;
}

function normalizeDateInput(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialDateToIso(value);
  }

  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const excelSerial = Number(rawValue);

  if (/^\d{4,6}(\.0+)?$/.test(rawValue) && Number.isFinite(excelSerial)) {
    return excelSerialDateToIso(excelSerial);
  }

  const dayMonthYear = rawValue.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);

  if (dayMonthYear) {
    const day = Number(dayMonthYear[1]);
    const month = Number(dayMonthYear[2]);
    const year = Number(dayMonthYear[3].length === 2 ? `20${dayMonthYear[3]}` : dayMonthYear[3]);
    return makeIsoDate(year, month, day);
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? "" : toIsoDate(parsed);
}

function excelSerialDateToIso(value: number) {
  const date = new Date(Date.UTC(1899, 11, 30));
  date.setUTCDate(date.getUTCDate() + Math.floor(value));
  return toIsoDate(date);
}

function makeIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "";
  }

  return toIsoDate(date);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(toNumber(value));
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

