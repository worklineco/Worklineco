"use client";

import { ArrowDown, ArrowUp, Download, History, Link2, Maximize2, Pencil, Plus, RotateCcw, Search, Settings2, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  poc_email: string;
  poc_mobile: string;
  poc_name: string;
  receiving_date: string | null;
  receiving_status: string;
  registration_type: string;
  remarks: string;
  sgst: number;
  source_module: string;
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
type BillingColumnLayout = { hiddenColumnKeys: string[]; order: string[] };
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
  poc_email: "",
  poc_mobile: "",
  poc_name: "",
  receiving_date: "",
  receiving_status: "Pending",
  registration_type: "",
  remarks: "",
  sgst: 0,
  source_module: "manual",
  total: 0,
  version_no: 1,
  voucher_type: "Proforma Invoice"
};
const defaultMasters: Record<string, string[]> = {
  billing_status: ["Draft", "Memo Raised", "Invoice Raised", "Cancelled"],
  cost_center: [],
  group_name: [],
  income_head: [],
  receiving_status: ["Pending", "Received", "Part Received"],
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
  { field: "owner_team", label: "Team", type: "text", width: 128 },
  { field: "source_module", label: "Source", type: "select", width: 110 },
  { field: "voucher_type", label: "Voucher", type: "select", width: 145 },
  { field: "group_name", label: "Group", type: "select", width: 145 },
  { field: "gstin", label: "GSTIN", type: "text", width: 160 },
  { field: "client", label: "Client", type: "text", width: 220 },
  { field: "place_of_supply", label: "Place of Supply", type: "text", width: 175 },
  { field: "registration_type", label: "Registration Type", type: "text", width: 170 },
  { field: "address", label: "Address", type: "text", width: 260 },
  { field: "poc_name", label: "POC", type: "text", width: 145 },
  { field: "poc_mobile", label: "POC Mobile", type: "text", width: 135 },
  { field: "poc_email", label: "POC Email", type: "text", width: 200 },
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
  { field: "receiving_status", label: "Receiving", type: "select", width: 138 },
  { field: "receiving_date", label: "Receiving Date", type: "date", width: 142 },
  { field: "remarks", label: "Remarks", type: "text", width: 220 },
  { field: "gstat_link", label: "GSTAT Link", width: 170 },
  { field: "actions", label: "Actions", width: 150 }
];
const billingColumnByKey = new Map(billingColumns.map((column) => [String(column.field), column]));
const defaultBillingColumnOrder = billingColumns.map((column) => String(column.field));
const billingColumnLayoutStorageKey = "workline:billing-column-layout:v1";
const importHeaders: Array<{ field: BillingField; label: string }> = [
  { field: "owner_team", label: "Team" },
  { field: "voucher_type", label: "Voucher Type" },
  { field: "group_name", label: "Group" },
  { field: "gstin", label: "GSTIN" },
  { field: "client", label: "Client" },
  { field: "place_of_supply", label: "Place of Supply" },
  { field: "registration_type", label: "Registration Type" },
  { field: "address", label: "Address" },
  { field: "poc_name", label: "POC Name" },
  { field: "poc_mobile", label: "POC Mobile" },
  { field: "poc_email", label: "POC Email" },
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
  { field: "receiving_status", label: "Receiving Status" },
  { field: "receiving_date", label: "Receiving Date" },
  { field: "remarks", label: "Remarks" }
];
const importActionColumn = "Import Action";
const importActionOptions = ["Add", "Update", "Delete"];
const accountsOnlyFields = new Set<BillingField>([
  "invoice_date",
  "invoice_no",
  "memo_date",
  "memo_no",
  "receiving_date",
  "receiving_status"
]);

export function BillingRegister() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [access, setAccess] = useState<AccessScope>({ canEditAccountsFields: false, canManageMasters: false, canViewAll: false, role: "", team: "" });
  const [addDraft, setAddDraft] = useState<BillingRecord | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [clientRecords, setClientRecords] = useState<ClientRegisterRow[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultBillingColumnOrder);
  const [hasLoadedColumnLayout, setHasLoadedColumnLayout] = useState(false);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(() => new Set());
  const [editDraft, setEditDraft] = useState<BillingRecord | null>(null);
  const [inlineEditor, setInlineEditor] = useState<InlineEditor | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isColumnOptionsOpen, setIsColumnOptionsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [matters, setMatters] = useState<GstatMatter[]>([]);
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [savingCell, setSavingCell] = useState<InlineEditor | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [trashRecords, setTrashRecords] = useState<TrashRecord[]>([]);
  const [viewMode, setViewMode] = useState<BillingView>("register");
  const [filters, setFilters] = useState({ search: "", status: "", team: "", source: "" });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [masters, setMasters] = useState(defaultMasters);

  const mergedMasters = useMemo(
    () =>
      Object.entries(defaultMasters).reduce<Record<string, string[]>>((result, [key, defaults]) => {
        result[key] = Array.from(new Set([...defaults, ...(masters[key] ?? [])].filter(Boolean)));
        return result;
      }, {}),
    [masters]
  );
  const teams = useMemo(
    () => Array.from(new Set(records.map((record) => record.owner_team).filter(Boolean))).sort(),
    [records]
  );
  const orderedBillingColumns = useMemo(
    () =>
      columnOrder
        .map((columnKey) => billingColumnByKey.get(columnKey))
        .filter((column): column is BillingColumn => Boolean(column)),
    [columnOrder]
  );
  const visibleBillingColumns = useMemo(
    () => orderedBillingColumns.filter((column) => column.field === "actions" || !hiddenColumnKeys.has(String(column.field))),
    [hiddenColumnKeys, orderedBillingColumns]
  );
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
          record.billing_status,
          record.receiving_status,
          getMatterLabel(record, matters)
        ].some((value) => String(value ?? "").toLowerCase().includes(search));

      const matchesColumnFilters = visibleBillingColumns.every((column) => {
        const filter = String(columnFilters[String(column.field)] ?? "").trim().toLowerCase();

        if (!filter || column.field === "actions") {
          return true;
        }

        return getDisplayValue(record, column, matters).toLowerCase().includes(filter);
      });

      return (
        matchesSearch &&
        matchesColumnFilters &&
        (!filters.status || record.billing_status === filters.status) &&
        (!filters.team || record.owner_team === filters.team) &&
        (!filters.source || record.source_module === filters.source)
      );
    });
  }, [columnFilters, filters, matters, records, visibleBillingColumns]);
  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedAuditLogs = selectedRecordId
    ? auditLogs.filter((log) => log.entity_id === selectedRecordId)
    : auditLogs.slice(0, 12);
  const totals = useMemo(
    () =>
      filteredRecords.reduce(
        (summary, record) => ({
          billed: summary.billed + toNumber(record.total),
          pending: summary.pending + (record.receiving_status === "Received" ? 0 : toNumber(record.total)),
          received: summary.received + (record.receiving_status === "Received" ? toNumber(record.total) : 0)
        }),
        { billed: 0, pending: 0, received: 0 }
      ),
    [filteredRecords]
  );
  const billingSummary = useMemo(() => getBillingSummary(filteredRecords), [filteredRecords]);
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim());

  useEffect(() => {
    void loadBilling();
    void loadClientRecords();
    const savedLayout = getSavedBillingColumnLayout();
    setColumnOrder(savedLayout.order);
    setHiddenColumnKeys(new Set(savedLayout.hiddenColumnKeys));
    setHasLoadedColumnLayout(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedColumnLayout) {
      return;
    }

    saveBillingColumnLayout({
      hiddenColumnKeys: Array.from(hiddenColumnKeys),
      order: columnOrder
    });
  }, [columnOrder, hasLoadedColumnLayout, hiddenColumnKeys]);

  useEffect(() => {
    setAddDraft((currentDraft) =>
      currentDraft ? enrichBillingRecord(currentDraft, clientRecords, currentDraft.client ? "client" : undefined) : currentDraft
    );
    setEditDraft((currentDraft) =>
      currentDraft ? enrichBillingRecord(currentDraft, clientRecords, currentDraft.client ? "client" : undefined) : currentDraft
    );
  }, [clientRecords]);

  async function loadClientRecords() {
    try {
      const response = await fetch("/api/client-records/managed", { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as { rows?: ClientRegisterRow[] };

      if (response.ok) {
        setClientRecords(result.rows ?? []);
      }
    } catch (error) {
      console.error("Billing client lookup load failed:", error);
    }
  }

  async function loadBilling() {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/billing", { cache: "no-store" });
      const result = (await response.json()) as {
        access?: AccessScope;
        auditLogs?: AuditLog[];
        error?: string;
        masters?: Record<string, string[]>;
        matters?: GstatMatter[];
        records?: BillingRecord[];
        trashRecords?: TrashRecord[];
      };

      if (!response.ok) {
        setMessage(result.error ?? "Could not load billing register.");
        return;
      }

      setAccess(result.access ?? access);
      setAuditLogs(result.auditLogs ?? []);
      setMasters({ ...defaultMasters, ...(result.masters ?? {}) });
      setMatters(result.matters ?? []);
      setRecords((result.records ?? []).map(normalizeRecord));
      setTrashRecords(result.trashRecords ?? []);
    } catch (error) {
      console.error("Billing load error:", error);
      setMessage("Could not load billing register.");
    } finally {
      setIsLoading(false);
    }
  }

  function openAddForm() {
    setAddDraft(enrichBillingRecord({
      ...emptyRecord,
      owner_team: access.team,
      source_module: "manual"
    }, clientRecords));
    setMessage("");
  }

  function updateAddDraft(field: BillingField, rawValue: string) {
    setAddDraft((currentDraft) =>
      currentDraft
        ? enrichBillingRecord(prepareRecordUpdate(currentDraft, field, rawValue), clientRecords, field)
        : currentDraft
    );
  }

  function openEditForm(record: BillingRecord) {
    setInlineEditor(null);
    setEditDraft(enrichBillingRecord(normalizeRecord(record), clientRecords));
    setMessage("");
  }

  function updateEditDraft(field: BillingField, rawValue: string) {
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

    const rawValue = valueOverride ?? inlineEditor.value;
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
      void loadBilling();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save billing cell.");
      await loadBilling();
    } finally {
      setSavingCell(null);
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
      void loadBilling();
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
    void loadBilling();
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
      void loadBilling();
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
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const billingRows = rows.map((row) => {
      const record = { ...emptyRecord };
      const importedRecord = record as unknown as Record<BillingField, unknown>;
      const importAction = normalizeImportAction(row[importActionColumn]);

      importHeaders.forEach(({ field, label }) => {
        const value = row[label] ?? row[field] ?? "";
        importedRecord[field] = isDateField(field) ? normalizeDateInput(value) : value;
      });

      record.source_module = "import";
      return {
        ...enrichBillingRecord(recalc(record), clientRecords, "gstin"),
        import_action: importAction
      };
    }).filter((row) => row.client || row.description || row.invoice_no);

    const response = await fetch("/api/billing", {
      body: JSON.stringify({ action: "import", rows: billingRows }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as {
      access?: AccessScope;
      auditLogs?: AuditLog[];
      error?: string;
      matters?: GstatMatter[];
        records?: BillingRecord[];
        trashRecords?: TrashRecord[];
      };

    if (!response.ok) {
      setMessage(result.error ?? "Could not import billing rows.");
      return;
    }

    setAccess(result.access ?? access);
    setAuditLogs(result.auditLogs ?? []);
    setMatters(result.matters ?? []);
    setRecords((result.records ?? []).map(normalizeRecord));
    setTrashRecords(result.trashRecords ?? []);
    setMessage(`Processed ${billingRows.length} billing import rows from ${file.name}.`);
  }

  function exportWorkbook() {
    const rows = filteredRecords.map((record, index) => ({
      [importActionColumn]: "Update",
      "S.no.": index + 1,
      Team: record.owner_team,
      Source: record.source_module,
      "Voucher Type": record.voucher_type,
      Group: record.group_name,
      GSTIN: record.gstin,
      Client: record.client,
      "Place of Supply": record.place_of_supply,
      "Registration Type": record.registration_type,
      Address: record.address,
      "POC Name": record.poc_name,
      "POC Mobile": record.poc_mobile,
      "POC Email": record.poc_email,
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
      "Receiving Status": record.receiving_status,
      "Receiving Date": formatDateForExport(record.receiving_date),
      Remarks: record.remarks,
      "GSTAT Link": getMatterLabel(record, matters)
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [blankExportRow()]);

    worksheet["!cols"] = Object.keys(rows.length ? rows[0] : blankExportRow()).map(() => ({ wch: 18 }));
    addImportActionDropdown(worksheet, Math.max(rows.length + 100, 500));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Firm Billing");
    XLSX.writeFile(workbook, "workline-firm-billing-register.xlsx");
    setMessage(`Exported ${filteredRecords.length} billing rows.`);
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

  return (
    <section className={`border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)] ${isFullscreen ? "fixed inset-3 z-50 overflow-auto rounded-lg" : "rounded-lg"}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Firm-wide billing</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Billing Register</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">
            {isLoading ? "Loading" : `${filteredRecords.length} visible of ${records.length} rows`} - total {formatMoney(totals.billed)}
          </p>
        </div>

        <div className="grid gap-2 text-sm font-black text-slate-700 sm:grid-cols-3 xl:min-w-[520px]">
          <Summary label="Received" value={formatMoney(totals.received)} />
          <Summary label="Pending" value={formatMoney(totals.pending)} />
          <Summary label="Access" value={access.canViewAll ? "All teams" : access.team || "Own rows"} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <ViewButton active={viewMode === "register"} label="Register" onClick={() => setViewMode("register")} />
        <ViewButton active={viewMode === "audit"} label="Audit Trail" onClick={() => setViewMode("audit")} />
        <ViewButton active={viewMode === "trash"} label={`Trash (${trashRecords.length})`} onClick={() => setViewMode("trash")} />
      </div>

      {viewMode === "register" ? (
        <BillingSummaryPanel
          onFilterStatus={(status) => setFilters((current) => ({ ...current, status }))}
          summary={billingSummary}
        />
      ) : null}

      {viewMode === "register" ? (
      <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_160px_150px_140px_auto]">
        <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search className="size-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search client, GSTIN, invoice, memo, team"
            value={filters.search}
          />
        </label>
        <SelectFilter
          label="Status"
          onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
          options={mergedMasters.billing_status}
          value={filters.status}
        />
        <SelectFilter
          label="Team"
          onChange={(value) => setFilters((current) => ({ ...current, team: value }))}
          options={teams}
          value={filters.team}
        />
        <SelectFilter
          label="Source"
          onChange={(value) => setFilters((current) => ({ ...current, source: value }))}
          options={["manual", "gstat", "import"]}
          value={filters.source}
        />
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <button className={buttonClass("light")} onClick={() => setIsColumnOptionsOpen((current) => !current)} type="button">
              <Settings2 className="size-4" />
              Columns
            </button>
            {isColumnOptionsOpen ? (
              <BillingColumnOptionsPanel
                hiddenColumnKeys={hiddenColumnKeys}
                onApply={(layout) => {
                  const normalizedLayout = normalizeBillingColumnLayout(layout);
                  setColumnOrder(normalizedLayout.order);
                  setHiddenColumnKeys(new Set(normalizedLayout.hiddenColumnKeys));
                  setIsColumnOptionsOpen(false);
                }}
                onClose={() => setIsColumnOptionsOpen(false)}
                orderedColumns={orderedBillingColumns}
              />
            ) : null}
          </div>
          <button className={buttonClass("primary")} onClick={openAddForm} type="button">
            <Plus className="size-4" />
            Add
          </button>
          <button className={buttonClass("dark")} onClick={exportWorkbook} type="button">
            <Download className="size-4" />
            Export
          </button>
          <button className={buttonClass("light")} onClick={downloadTemplate} type="button">
            Template
          </button>
          <button className={buttonClass("light")} onClick={() => fileInputRef.current?.click()} type="button">
            <Upload className="size-4" />
            Import
          </button>
          <button className={buttonClass("light")} onClick={() => setIsFullscreen((current) => !current)} type="button">
            <Maximize2 className="size-4" />
          </button>
          {hasActiveColumnFilters ? (
            <button className={buttonClass("light")} onClick={() => setColumnFilters({})} type="button">
              Clear column filters
            </button>
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
      ) : null}

      {message ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
          {message}
        </p>
      ) : null}

      {viewMode === "register" ? (
      <div className="mt-4">
        <div className="overflow-auto rounded-md border border-slate-200 bg-white">
          <table className="table-fixed border-collapse text-left text-sm" style={{ minWidth: visibleTableWidth, width: visibleTableWidth }}>
            <colgroup>
              {visibleBillingColumns.map((column) => (
                <col key={column.field} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-950 text-xs font-black uppercase text-white">
              <tr>
                {visibleBillingColumns.map((column) => (
                  <th className="border-r border-white/10 px-3 py-3 last:border-r-0" key={column.field}>
                    {column.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-slate-900">
                {visibleBillingColumns.map((column) => (
                  <th className="border-r border-white/10 px-2 py-2 last:border-r-0" key={`filter-${column.field}`}>
                    {column.field === "actions" ? null : (
                      <input
                        aria-label={`Filter ${column.label}`}
                        className="h-8 w-full rounded-md border border-white/10 bg-white px-2 text-xs font-bold normal-case text-slate-950 outline-none"
                        onChange={(event) =>
                          setColumnFilters((current) => ({
                            ...current,
                            [String(column.field)]: event.target.value
                          }))
                        }
                        placeholder="Filter"
                        value={columnFilters[String(column.field)] ?? ""}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={visibleBillingColumns.length}>Loading billing rows...</td></tr>
              ) : filteredRecords.length ? (
                filteredRecords.map((record) => (
                  <tr className="border-b border-slate-100 last:border-b-0" key={record.id}>
                    {visibleBillingColumns.map((column) => (
                      <BillingCell
                        access={access}
                        column={column}
                        inlineEditor={inlineEditor}
                        key={`${record.id}-${column.field}`}
                        masters={mergedMasters}
                        matters={matters}
                        onDelete={() => deleteRecord(record)}
                        onEdit={(field, value) => setInlineEditor({ field, recordId: record.id!, value })}
                        onEditForm={() => openEditForm(record)}
                        onEditorChange={(value) =>
                          setInlineEditor((currentEditor) => (currentEditor ? { ...currentEditor, value } : currentEditor))
                        }
                        onHistory={() => setSelectedRecordId(record.id ?? null)}
                        onDirectSave={(field, value) => saveDirectField(record, field, value)}
                        onSave={saveInlineEditor}
                        record={record}
                        savingCell={savingCell}
                      />
                    ))}
                  </tr>
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
        <BillingAuditTable logs={auditLogs} isLoading={isLoading} />
      ) : null}

      {viewMode === "trash" ? (
        <BillingTrashTable isLoading={isLoading} onRestore={restoreTrashRecord} rows={trashRecords} />
      ) : null}

      {addDraft ? (
        <BillingAddForm
          access={access}
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
          draft={editDraft}
          masters={mergedMasters}
          mode="edit"
          onChange={updateEditDraft}
          onClose={() => setEditDraft(null)}
          onSubmit={saveEditDraft}
        />
      ) : null}

      {selectedRecordId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <section className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.30)]">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">Row history</p>
                <h3 className="mt-1 text-xl font-black text-slate-950">
                  {selectedRecord?.client || selectedRecord?.invoice_no || selectedRecord?.memo_no || "Billing row"}
                </h3>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {selectedRecord?.owner_team || "No team"} - {selectedRecord?.billing_status || "Draft"}
                </p>
              </div>
              <button
                className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setSelectedRecordId(null)}
                title="Close history"
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="max-h-[64vh] overflow-auto p-5">
              {selectedAuditLogs.length ? (
                <div className="space-y-3">
                  {selectedAuditLogs.map((log) => (
                    <article className="rounded-md border border-slate-200 p-4" key={log.id}>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black uppercase text-slate-950">
                            {log.action.replace("billing.", "")}
                          </p>
                          <p className="text-xs font-bold text-slate-500">Updated by {log.actor_name || "Unknown user"}</p>
                        </div>
                        <p className="text-xs font-bold text-slate-500">{formatDateTime(log.created_at)}</p>
                      </div>
                      <AuditChangesList changes={getAuditChanges(log)} />
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-slate-200 px-3 py-8 text-center text-sm font-bold text-slate-500">
                  No history entries found for this billing row.
                </p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function BillingCell({
  access,
  column,
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
  savingCell
}: {
  access: AccessScope;
  column: BillingColumn;
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
}) {
  const isActions = column.field === "actions";
  const isGstatLink = column.field === "gstat_link";
  const field = column.field as BillingField;
  const isAccountsOnly = accountsOnlyFields.has(field);
  const isReadOnly =
    column.field === "total" ||
    (!access.canViewAll && column.field === "owner_team") ||
    (isAccountsOnly && !access.canEditAccountsFields);
  const isEditing = Boolean(inlineEditor && inlineEditor.recordId === record.id && inlineEditor.field === field);
  const isSaving = Boolean(savingCell && savingCell.recordId === record.id && savingCell.field === field);
  const editorValue = isEditing ? inlineEditor?.value ?? "" : "";
  const displayValue = getDisplayValue(record, column, matters);

  if (isActions) {
    return (
      <td className="border-r border-slate-100 px-3 py-2 last:border-r-0">
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
            className="inline-flex size-8 items-center justify-center rounded-md border border-teal-200 text-teal-700 hover:bg-teal-50"
            onClick={onHistory}
            title="View row history"
            type="button"
          >
            <History className="size-4" />
          </button>
          <button
            className="inline-flex size-8 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
            onClick={onDelete}
            title="Delete billing row"
            type="button"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    );
  }

  if (isGstatLink) {
    const currentLabel = getMatterLabel(record, matters);

    return (
      <td className="border-r border-slate-100 px-2 py-2 last:border-r-0">
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
    <td className="border-r border-slate-100 px-2 py-2 font-semibold text-slate-700 last:border-r-0">
      {isEditing && column.type === "select" ? (
        <select
          autoFocus
          className="h-8 w-full rounded-md border border-teal-300 bg-white px-2 text-xs font-bold outline-none ring-2 ring-teal-100"
          onBlur={() => onSave()}
          onChange={(event) => {
            onEditorChange(event.target.value);
            onSave(event.target.value);
          }}
          value={editorValue}
        >
          {selectOptions(field, masters).map((option) => (
            <option key={option} value={option}>{option || "-"}</option>
          ))}
        </select>
      ) : isEditing ? (
        <input
          autoFocus
          className="h-8 w-full rounded-md border border-teal-300 bg-white px-2 text-xs font-bold outline-none ring-2 ring-teal-100"
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
          placeholder={column.type === "date" ? "dd-mm-yyyy" : undefined}
          type={column.type === "money" ? "number" : "text"}
          value={editorValue}
        />
      ) : (
        <button
          className={`block h-8 w-full min-w-0 truncate rounded px-1.5 text-left ${
            isReadOnly ? "cursor-default" : "cursor-text hover:bg-slate-50 hover:ring-1 hover:ring-teal-200"
          }`}
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
  draft,
  masters,
  mode,
  onChange,
  onClose,
  onSubmit
}: {
  access: AccessScope;
  draft: BillingRecord;
  masters: Record<string, string[]>;
  mode: "create" | "edit";
  onChange: (field: BillingField, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isEdit = mode === "edit";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <section className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.30)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
              {isEdit ? "Edit billing record" : "New billing record"}
            </p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">
              {isEdit ? "Edit Billing Entry" : "Create Billing Entry"}
            </h3>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {isEdit ? "Update this billing row in one place. Cell editing remains available in the table." : "Enter GSTIN first to auto-fill client, POS, and registration type."}
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

        <div className="max-h-[68vh] overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            <FormInput field="client" label="Client" onChange={onChange} value={draft.client} />
            <FormInput field="place_of_supply" label="Place of Supply" onChange={onChange} value={draft.place_of_supply} />
            <FormInput field="registration_type" label="Registration Type" onChange={onChange} value={draft.registration_type} />
            <FormInput field="address" label="Address" onChange={onChange} value={draft.address} wide />
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
              <span className="text-[10px] font-black uppercase text-slate-500">Receiving</span>
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
            <FormInput field="receiving_date" label="Receiving Date" onChange={onChange} placeholder="dd-mm-yyyy" readOnly={!access.canEditAccountsFields} value={formatDateForInput(draft.receiving_date)} />
            <FormInput field="remarks" label="Remarks" onChange={onChange} value={draft.remarks} wide />
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

const formControlClass = "mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100";

function BillingSummaryPanel({
  onFilterStatus,
  summary
}: {
  onFilterStatus: (status: string) => void;
  summary: ReturnType<typeof getBillingSummary>;
}) {
  return (
    <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-3 xl:grid-cols-[260px_1fr_1fr_1fr]">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Summary</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{summary.rowCount}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">visible billing row{summary.rowCount === 1 ? "" : "s"}</p>
          <p className="mt-3 text-sm font-black text-slate-950">{formatMoney(summary.total)}</p>
          <p className="text-xs font-bold text-slate-500">total billing value</p>
        </div>
        <SummaryGroup items={summary.billingStatus} onSelect={onFilterStatus} title="Billing Status" />
        <SummaryGroup items={summary.receivingStatus} title="Receiving Status" />
        <SummaryGroup items={summary.sources} title="Source" />
      </div>
    </section>
  );
}

function SummaryGroup({
  items,
  onSelect,
  title
}: {
  items: Array<{ amount: number; count: number; label: string }>;
  onSelect?: (label: string) => void;
  title: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <div className="mt-2 grid gap-1.5">
        {items.length ? items.slice(0, 8).map((item) => (
          <button
            className={`grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md px-2 py-1.5 text-left ${onSelect ? "hover:bg-slate-50" : "cursor-default"}`}
            disabled={!onSelect}
            key={item.label}
            onClick={() => onSelect?.(item.label)}
            type="button"
          >
            <span className="min-w-0 truncate text-xs font-black text-slate-700">{item.label || "Not set"}</span>
            <span className="text-xs font-bold text-slate-500">{item.count} / {formatMoney(item.amount)}</span>
          </button>
        )) : (
          <p className="py-3 text-xs font-bold text-slate-500">No rows.</p>
        )}
      </div>
    </div>
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

function SelectFilter({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <select
      aria-label={label}
      className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{label}: All</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function ViewButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-xs font-black uppercase transition ${
        active ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function BillingColumnOptionsPanel({
  hiddenColumnKeys,
  onApply,
  onClose,
  orderedColumns
}: {
  hiddenColumnKeys: Set<string>;
  onApply: (layout: BillingColumnLayout) => void;
  onClose: () => void;
  orderedColumns: BillingColumn[];
}) {
  const [draftOrder, setDraftOrder] = useState<string[]>(() => orderedColumns.map((column) => String(column.field)));
  const [draftHiddenColumnKeys, setDraftHiddenColumnKeys] = useState<Set<string>>(() => new Set(hiddenColumnKeys));
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
    <div className="absolute left-0 top-12 z-[80] w-[360px] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-2xl">
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
          onClick={() => onApply({ hiddenColumnKeys: Array.from(draftHiddenColumnKeys), order: draftOrder })}
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
        <thead className="sticky top-0 z-10 bg-slate-950 text-white">
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
                <td className="border-b border-r border-slate-200 px-3 py-2 font-black text-slate-900">{log.action.replace("billing.", "")}</td>
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
          {!logs.length && !isLoading ? (
            <tr>
              <td className="px-3 py-8 text-center text-sm font-bold text-slate-500" colSpan={6}>
                <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" /> No billing audit entries found.</span>
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
        <thead className="sticky top-0 z-10 bg-slate-950 text-white">
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
          {!rows.length && !isLoading ? (
            <tr>
              <td className="px-3 py-8 text-center text-sm font-bold text-slate-500" colSpan={8}>
                <span className="inline-flex items-center gap-2"><Trash2 className="size-4" /> No deleted billing rows are currently in trash.</span>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function AuditChangesList({ changes }: { changes: AuditChange[] }) {
  if (!changes.length) {
    return (
      <p className="mt-3 rounded-md border border-slate-200 px-3 py-3 text-sm font-bold text-slate-500">
        No field-level change captured.
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
      {changes.map((change) => (
        <div className="grid gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]" key={change.field}>
          <p className="font-black text-slate-700">{change.label}</p>
          <p className="min-w-0 break-words font-semibold text-slate-500">From: {change.oldValue || "-"}</p>
          <p className="min-w-0 break-words font-semibold text-slate-950">To: {change.newValue || "-"}</p>
        </div>
      ))}
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
  const matchedClient = findClientByGstin(record.gstin, clientRecords);
  const placeOfSupply = changedField === "place_of_supply"
    ? record.place_of_supply
    : stateFromGstin(record.gstin) || record.place_of_supply;
  const ope = toNumber(record.ope);
  const taxBase = getTaxBase(toNumber(record.amount), ope, record.include_ope_in_fees);
  const tax = calculateTax(taxBase, placeOfSupply);

  return recalc({
    ...record,
    address: changedField === "address" ? record.address : getClientAddress(matchedClient) || record.address,
    cgst: tax.cgst,
    client: changedField === "client" ? record.client : getClientName(matchedClient) || record.client,
    igst: tax.igst,
    place_of_supply: placeOfSupply,
    registration_type: getRegistrationType(matchedClient) || record.registration_type,
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
    sgst: toNumber(record.sgst),
    total: toNumber(record.total),
    version_no: Number(record.version_no ?? 1)
  });
}

function recalc(record: BillingRecord): BillingRecord {
  return {
    ...record,
    total: toNumber(record.amount) + toNumber(record.cgst) + toNumber(record.sgst) + toNumber(record.igst) + toNumber(record.ope)
  };
}

function getDisplayValue(record: BillingRecord, column: BillingColumn, matters: GstatMatter[]) {
  if (column.field === "gstat_link") {
    return getMatterLabel(record, matters);
  }

  if (column.field === "actions") {
    return "";
  }

  const value = record[column.field];

  if (column.type === "money" || column.field === "total") {
    return formatMoney(value as number);
  }

  if (column.type === "date") {
    return formatDate(String(value ?? ""));
  }

  return String(value ?? "");
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
    return ["manual", "gstat", "import"];
  }

  if (field === "include_ope_in_fees") {
    return ["No", "Yes"];
  }

  return ["", ...(masters[field] ?? [])];
}

function buttonClass(kind: "dark" | "light" | "primary") {
  if (kind === "primary") {
    return "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-black text-white transition hover:bg-teal-800";
  }

  if (kind === "dark") {
    return "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-black text-white transition hover:bg-slate-800";
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

function getRegistrationType(row: ClientRegisterRow | null) {
  return getFirstValue(row, registrationTypeKeys);
}

function getClientAddress(row: ClientRegisterRow | null) {
  return getFirstValue(row, clientAddressKeys);
}

function getSavedBillingColumnLayout(): BillingColumnLayout {
  if (typeof window === "undefined") {
    return { hiddenColumnKeys: [], order: defaultBillingColumnOrder };
  }

  try {
    const savedLayout = window.localStorage.getItem(billingColumnLayoutStorageKey);

    if (!savedLayout) {
      return { hiddenColumnKeys: [], order: defaultBillingColumnOrder };
    }

    return normalizeBillingColumnLayout(JSON.parse(savedLayout) as Partial<BillingColumnLayout>);
  } catch {
    return { hiddenColumnKeys: [], order: defaultBillingColumnOrder };
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
  const order = [...savedOrder, ...defaultBillingColumnOrder.filter((key) => !savedOrder.includes(key))];
  const hiddenColumnKeys = Array.isArray(layout.hiddenColumnKeys)
    ? layout.hiddenColumnKeys.filter((key) => knownColumnKeys.has(key) && key !== "actions")
    : [];

  return { hiddenColumnKeys, order };
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

const gstinKeys = ["GSTIN/UIN", "GSTIN", "GSTIN No", "GSTIN No.", "GST No", "GST Number", "GSTAT Login ID"];
const clientNameKeys = ["Particulars", "Client", "Client Name", "Name", "Legal Name", "Trade Name"];
const clientAddressKeys = ["Address", "Client Address", "Billing Address", "Registered Address", "Principal Place of Business"];
const registrationTypeKeys = ["Registration Type", "Reg Type", "GST Registration Type", "Registration"];

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
  "gstat_appeal_id"
];

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
