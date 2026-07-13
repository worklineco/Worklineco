"use client";

import { Download, History, Link2, Maximize2, Plus, Search, Trash2, Upload, X } from "lucide-react";
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
  income_head: string;
  invoice_date: string | null;
  invoice_no: string;
  memo_date: string | null;
  memo_no: string;
  owner_team: string;
  person_authorised: string;
  poc_email: string;
  poc_mobile: string;
  poc_name: string;
  receiving_status: string;
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
  canManageMasters: boolean;
  canViewAll: boolean;
  role: string;
  team: string;
};
type AuditLog = {
  action: string;
  created_at: string;
  entity_id: string | null;
  id: string;
  new_value: Partial<BillingRecord> | null;
  old_value: Partial<BillingRecord> | null;
};
type BillingField = keyof BillingRecord;
type BillingColumn = {
  field: BillingField | "gstat_link" | "history" | "actions";
  label: string;
  type?: "date" | "money" | "select" | "text";
  width: number;
};
type InlineEditor = { field: BillingField; recordId: string; value: string };

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
  income_head: "",
  invoice_date: "",
  invoice_no: "",
  memo_date: "",
  memo_no: "",
  owner_team: "",
  person_authorised: "",
  poc_email: "",
  poc_mobile: "",
  poc_name: "",
  receiving_status: "Pending",
  remarks: "",
  sgst: 0,
  source_module: "manual",
  total: 0,
  version_no: 1,
  voucher_type: ""
};
const defaultMasters: Record<string, string[]> = {
  billing_status: ["Draft", "Memo Raised", "Invoice Raised", "Cancelled"],
  cost_center: [],
  group_name: [],
  income_head: [],
  receiving_status: ["Pending", "Received", "Part Received"],
  voucher_type: ["Tax Invoice", "Debit Note", "Credit Note", "Memo"]
};
const billingColumns: BillingColumn[] = [
  { field: "owner_team", label: "Team", type: "text", width: 128 },
  { field: "source_module", label: "Source", type: "select", width: 110 },
  { field: "gstat_link", label: "GSTAT Link", width: 260 },
  { field: "cost_center", label: "Cost Center", type: "select", width: 150 },
  { field: "person_authorised", label: "Authorised", type: "text", width: 160 },
  { field: "voucher_type", label: "Voucher", type: "select", width: 145 },
  { field: "income_head", label: "Income Head", type: "select", width: 155 },
  { field: "group_name", label: "Group", type: "select", width: 145 },
  { field: "client", label: "Client", type: "text", width: 220 },
  { field: "gstin", label: "GSTIN", type: "text", width: 160 },
  { field: "poc_name", label: "POC", type: "text", width: 145 },
  { field: "poc_mobile", label: "POC Mobile", type: "text", width: 135 },
  { field: "poc_email", label: "POC Email", type: "text", width: 200 },
  { field: "description", label: "Description", type: "text", width: 260 },
  { field: "amount", label: "Amount", type: "money", width: 118 },
  { field: "cgst", label: "CGST", type: "money", width: 104 },
  { field: "sgst", label: "SGST", type: "money", width: 104 },
  { field: "igst", label: "IGST", type: "money", width: 104 },
  { field: "total", label: "Total", width: 124 },
  { field: "billing_status", label: "Billing", type: "select", width: 140 },
  { field: "memo_no", label: "Memo No.", type: "text", width: 135 },
  { field: "memo_date", label: "Memo Date", type: "date", width: 132 },
  { field: "invoice_no", label: "Invoice No.", type: "text", width: 140 },
  { field: "invoice_date", label: "Invoice Date", type: "date", width: 132 },
  { field: "receiving_status", label: "Receiving", type: "select", width: 138 },
  { field: "remarks", label: "Remarks", type: "text", width: 220 },
  { field: "history", label: "History", width: 84 },
  { field: "actions", label: "Actions", width: 84 }
];
const tableWidth = billingColumns.reduce((total, column) => total + column.width, 0);
const importHeaders: Array<{ field: BillingField; label: string }> = [
  { field: "owner_team", label: "Team" },
  { field: "cost_center", label: "Cost Center" },
  { field: "person_authorised", label: "Person Authorised" },
  { field: "voucher_type", label: "Voucher Type" },
  { field: "income_head", label: "Income Head" },
  { field: "group_name", label: "Group" },
  { field: "client", label: "Client" },
  { field: "gstin", label: "GSTIN" },
  { field: "poc_name", label: "POC Name" },
  { field: "poc_mobile", label: "POC Mobile" },
  { field: "poc_email", label: "POC Email" },
  { field: "description", label: "Description" },
  { field: "amount", label: "Amount" },
  { field: "cgst", label: "CGST" },
  { field: "sgst", label: "SGST" },
  { field: "igst", label: "IGST" },
  { field: "billing_status", label: "Billing Status" },
  { field: "memo_no", label: "Memo No." },
  { field: "memo_date", label: "Memo Date" },
  { field: "invoice_no", label: "Invoice No." },
  { field: "invoice_date", label: "Invoice Date" },
  { field: "receiving_status", label: "Receiving Status" },
  { field: "remarks", label: "Remarks" }
];

export function BillingRegister() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [access, setAccess] = useState<AccessScope>({ canManageMasters: false, canViewAll: false, role: "", team: "" });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [inlineEditor, setInlineEditor] = useState<InlineEditor | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [matters, setMatters] = useState<GstatMatter[]>([]);
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [savingCell, setSavingCell] = useState<InlineEditor | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ search: "", status: "", team: "", source: "" });
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

      return (
        matchesSearch &&
        (!filters.status || record.billing_status === filters.status) &&
        (!filters.team || record.owner_team === filters.team) &&
        (!filters.source || record.source_module === filters.source)
      );
    });
  }, [filters, matters, records]);
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

  useEffect(() => {
    void loadBilling();
  }, []);

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
    } catch (error) {
      console.error("Billing load error:", error);
      setMessage("Could not load billing register.");
    } finally {
      setIsLoading(false);
    }
  }

  async function addBlankRecord() {
    const draft = {
      ...emptyRecord,
      owner_team: access.team,
      source_module: "manual"
    };

    setMessage("Adding billing row...");

    try {
      const saved = await saveRecord(draft);
      setRecords((currentRecords) => [normalizeRecord(saved), ...currentRecords]);
      setSelectedRecordId(saved.id ?? null);
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
    const nextRecord = prepareRecordUpdate(record, inlineEditor.field, rawValue);

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
    let nextRecord = prepareRecordUpdate(record, field, rawValue);

    if (field === "gstat_appeal_id") {
      const matter = matters.find((item) => item.id === rawValue);

      nextRecord = {
        ...nextRecord,
        client: matter?.client || nextRecord.client,
        description: matter?.matter_description || nextRecord.description,
        gstin: matter?.gstin || nextRecord.gstin,
        owner_team: access.canViewAll ? matter?.owner_team || nextRecord.owner_team : nextRecord.owner_team
      };
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
    setMessage("Billing row deleted.");
    void loadBilling();
  }

  async function importWorkbook(file: File) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const billingRows = rows.map((row) => {
      const record = { ...emptyRecord };
      const importedRecord = record as unknown as Record<BillingField, unknown>;

      importHeaders.forEach(({ field, label }) => {
        const value = row[label] ?? row[field] ?? "";
        importedRecord[field] = value;
      });

      record.source_module = "import";
      return recalc(record);
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
    };

    if (!response.ok) {
      setMessage(result.error ?? "Could not import billing rows.");
      return;
    }

    setAccess(result.access ?? access);
    setAuditLogs(result.auditLogs ?? []);
    setMatters(result.matters ?? []);
    setRecords((result.records ?? []).map(normalizeRecord));
    setMessage(`Imported ${billingRows.length} billing rows from ${file.name}.`);
  }

  function exportWorkbook() {
    const rows = filteredRecords.map((record, index) => ({
      "S.no.": index + 1,
      Team: record.owner_team,
      Source: record.source_module,
      "GSTAT Link": getMatterLabel(record, matters),
      "Cost Center": record.cost_center,
      "Person Authorised": record.person_authorised,
      "Voucher Type": record.voucher_type,
      "Income Head": record.income_head,
      Group: record.group_name,
      Client: record.client,
      GSTIN: record.gstin,
      "POC Name": record.poc_name,
      "POC Mobile": record.poc_mobile,
      "POC Email": record.poc_email,
      Description: record.description,
      Amount: record.amount,
      CGST: record.cgst,
      SGST: record.sgst,
      IGST: record.igst,
      Total: record.total,
      "Billing Status": record.billing_status,
      "Memo No.": record.memo_no,
      "Memo Date": record.memo_date ?? "",
      "Invoice No.": record.invoice_no,
      "Invoice Date": record.invoice_date ?? "",
      "Receiving Status": record.receiving_status,
      Remarks: record.remarks
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [blankExportRow()]);

    worksheet["!cols"] = Array.from({ length: 27 }, () => ({ wch: 18 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Firm Billing");
    XLSX.writeFile(workbook, "workline-firm-billing-register.xlsx");
    setMessage(`Exported ${filteredRecords.length} billing rows.`);
  }

  function downloadTemplate() {
    const worksheet = XLSX.utils.json_to_sheet([importHeaders.reduce<Record<string, string>>((row, header) => {
      row[header.label] = "";
      return row;
    }, {})]);
    worksheet["!cols"] = importHeaders.map(() => ({ wch: 20 }));
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
          <button className={buttonClass("primary")} onClick={addBlankRecord} type="button">
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

      {message ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
          {message}
        </p>
      ) : null}

      <div className="mt-4">
        <div className="overflow-auto rounded-md border border-slate-200 bg-white">
          <table className="table-fixed border-collapse text-left text-sm" style={{ minWidth: tableWidth, width: tableWidth }}>
            <colgroup>
              {billingColumns.map((column) => (
                <col key={column.field} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-950 text-xs font-black uppercase text-white">
              <tr>
                {billingColumns.map((column) => (
                  <th className="border-r border-white/10 px-3 py-3 last:border-r-0" key={column.field}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={billingColumns.length}>Loading billing rows...</td></tr>
              ) : filteredRecords.length ? (
                filteredRecords.map((record) => (
                  <tr className="border-b border-slate-100 last:border-b-0" key={record.id}>
                    {billingColumns.map((column) => (
                      <BillingCell
                        access={access}
                        column={column}
                        inlineEditor={inlineEditor}
                        key={`${record.id}-${column.field}`}
                        masters={mergedMasters}
                        matters={matters}
                        onDelete={() => deleteRecord(record)}
                        onEdit={(field, value) => setInlineEditor({ field, recordId: record.id!, value })}
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
                <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={billingColumns.length}>No billing rows match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                        <p className="text-sm font-black uppercase text-slate-950">
                          {log.action.replace("billing.", "")}
                        </p>
                        <p className="text-xs font-bold text-slate-500">{formatDateTime(log.created_at)}</p>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <AuditValue label="Previous data" value={log.old_value} />
                        <AuditValue label="Updated data" value={log.new_value} />
                      </div>
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
  onEditorChange: (value: string) => void;
  onHistory: () => void;
  onDirectSave: (field: BillingField, value: string) => void;
  onSave: (valueOverride?: string) => void;
  record: BillingRecord;
  savingCell: InlineEditor | null;
}) {
  const isActions = column.field === "actions";
  const isHistory = column.field === "history";
  const isGstatLink = column.field === "gstat_link";
  const field = column.field as BillingField;
  const isReadOnly = column.field === "total" || (!access.canViewAll && column.field === "owner_team");
  const isEditing = Boolean(inlineEditor && inlineEditor.recordId === record.id && inlineEditor.field === field);
  const isSaving = Boolean(savingCell && savingCell.recordId === record.id && savingCell.field === field);
  const editorValue = isEditing ? inlineEditor?.value ?? "" : "";
  const displayValue = getDisplayValue(record, column, matters);

  if (isActions) {
    return (
      <td className="border-r border-slate-100 px-3 py-2 last:border-r-0">
        <button
          className="inline-flex size-8 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
          onClick={onDelete}
          title="Delete billing row"
          type="button"
        >
          <Trash2 className="size-4" />
        </button>
      </td>
    );
  }

  if (isHistory) {
    return (
      <td className="border-r border-slate-100 px-3 py-2 last:border-r-0">
        <button
          className="inline-flex size-8 items-center justify-center rounded-md border border-teal-200 text-teal-700 hover:bg-teal-50"
          onClick={onHistory}
          title="View row history"
          type="button"
        >
          <History className="size-4" />
        </button>
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
          type={column.type === "date" ? "date" : column.type === "money" ? "number" : "text"}
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
              onEdit(field, String(record[field] ?? ""));
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

function AuditValue({ label, value }: { label: string; value: Partial<BillingRecord> | null }) {
  const entries = auditEntries(value);

  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      {entries.length ? (
        <dl className="mt-2 space-y-1">
          {entries.map(([key, entryValue]) => (
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-xs" key={key}>
              <dt className="font-black text-slate-600">{auditLabel(key)}</dt>
              <dd className="min-w-0 break-words font-semibold text-slate-900">{entryValue}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs font-bold text-slate-500">No data</p>
      )}
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

function normalizeRecord(record: BillingRecord): BillingRecord {
  return recalc({
    ...emptyRecord,
    ...record,
    amount: toNumber(record.amount),
    cgst: toNumber(record.cgst),
    igst: toNumber(record.igst),
    sgst: toNumber(record.sgst),
    total: toNumber(record.total),
    version_no: Number(record.version_no ?? 1)
  });
}

function recalc(record: BillingRecord): BillingRecord {
  return {
    ...record,
    total: toNumber(record.amount) + toNumber(record.cgst) + toNumber(record.sgst) + toNumber(record.igst)
  };
}

function getDisplayValue(record: BillingRecord, column: BillingColumn, matters: GstatMatter[]) {
  if (column.field === "gstat_link") {
    return getMatterLabel(record, matters);
  }

  if (column.field === "history" || column.field === "actions") {
    return "";
  }

  const value = record[column.field];

  if (column.type === "money" || column.field === "total") {
    return formatMoney(value as number);
  }

  return String(value ?? "");
}

function getMatterLabel(record: BillingRecord, matters: GstatMatter[]) {
  return matters.find((matter) => matter.id === record.gstat_appeal_id)?.label ?? "";
}

function getColumnLabel(field: BillingField) {
  return billingColumns.find((column) => column.field === field)?.label ?? field;
}

function isMoneyField(field: BillingField) {
  return ["amount", "cgst", "sgst", "igst", "total"].includes(field);
}

function selectOptions(field: BillingField, masters: Record<string, string[]>) {
  if (field === "source_module") {
    return ["manual", "gstat", "import"];
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
    row[header.label] = "";
    return row;
  }, {});
}

function auditEntries(value: Partial<BillingRecord> | null) {
  if (!value) {
    return [];
  }

  return [
    ["owner_team", value.owner_team],
    ["client", value.client],
    ["invoice_no", value.invoice_no],
    ["invoice_date", value.invoice_date],
    ["memo_no", value.memo_no],
    ["billing_status", value.billing_status],
    ["receiving_status", value.receiving_status],
    ["amount", formatAuditMoney(value.amount)],
    ["cgst", formatAuditMoney(value.cgst)],
    ["sgst", formatAuditMoney(value.sgst)],
    ["igst", formatAuditMoney(value.igst)],
    ["total", formatAuditMoney(value.total)],
    ["remarks", value.remarks]
  ].filter((entry): entry is [string, string] => Boolean(String(entry[1] ?? "").trim()));
}

function auditLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isDefined(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function formatAuditMoney(value: unknown) {
  return isDefined(value) ? formatMoney(String(value)) : "";
}

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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
