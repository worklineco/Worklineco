"use client";

import { ArrowDown, ArrowUp, Download, History, Pencil, Plus, Search, Settings2, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";

type TaskLineColumn = {
  key: string;
  label: string;
  type?: "date" | "money" | "number" | "select" | "text";
  width: number;
};
type TaskLineRow = Record<string, string>;
type TaskLineColumnLayout = { hiddenColumnKeys: string[]; order: string[] };
type TaskLineAuditLog = {
  action: string;
  createdAt: string;
  field?: string;
  id: string;
  newValue?: string;
  oldValue?: string;
  rowLabel?: string;
};
type TaskLineView = "audit" | "register";

const importActionColumn = "Import Action";
const importActionOptions = ["Add", "Update", "Delete"];
const taskLineColumnLayoutStorageKey = "workline:taskline-column-layout:v1";
const actionColumnWidth = 132;
const taskLineColumns: TaskLineColumn[] = [
  { key: "team", label: "Team", width: 120 },
  { key: "serial_no", label: "S. No.", width: 82 },
  { key: "name", label: "Name", width: 160 },
  { key: "resource", label: "Resource", width: 150 },
  { key: "entity_group", label: "Entity Group", width: 170 },
  { key: "entity", label: "Entity", width: 190 },
  { key: "state_name", label: "State Name", width: 140 },
  { key: "task", label: "Task", width: 230 },
  { key: "due_date", label: "Due Date", type: "date", width: 135 },
  { key: "stage", label: "Stage", width: 140 },
  { key: "status_open_close", label: "Status Open/Close", type: "select", width: 170 },
  { key: "remarks", label: "Remarks", width: 220 },
  { key: "ref_date", label: "Order/SCN,etc. Ref. Date", type: "date", width: 200 },
  { key: "ref_no", label: "Order/SCN,etc. Ref. No", width: 200 },
  { key: "period", label: "Period", width: 120 },
  { key: "section", label: "Section (73/74/75)", width: 160 },
  { key: "issue", label: "Issue", width: 220 },
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
const statusOptions = ["", "Open", "Close"];
const defaultRows = Array.from({ length: 8 }, (_, index) => createEmptyRow(`initial-${index + 1}`));

export function TaskLineRegister() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [columnOrder, setColumnOrder] = useState(() => getSavedTaskLineColumnLayout().order);
  const [auditLogs, setAuditLogs] = useState<TaskLineAuditLog[]>([]);
  const [formDraft, setFormDraft] = useState<TaskLineRow | null>(null);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(() => new Set(getSavedTaskLineColumnLayout().hiddenColumnKeys));
  const [isColumnOptionsOpen, setIsColumnOptionsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rows, setRows] = useState<TaskLineRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<TaskLineView>("register");

  const orderedColumns = useMemo(
    () => columnOrder.map((key) => taskLineColumnByKey.get(key)).filter((column): column is TaskLineColumn => Boolean(column)),
    [columnOrder]
  );
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !hiddenColumnKeys.has(column.key)),
    [hiddenColumnKeys, orderedColumns]
  );
  const tableWidth = useMemo(() => actionColumnWidth + visibleColumns.reduce((total, column) => total + column.width, 0), [visibleColumns]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch = !query || taskLineColumns.some((column) => text(row[column.key]).toLowerCase().includes(query));
      const matchesStatus = !statusFilter || row.status_open_close === statusFilter;
      const matchesColumnFilters = visibleColumns.every((column) => {
        const filter = text(columnFilters[column.key]).trim().toLowerCase();
        return !filter || text(row[column.key]).toLowerCase().includes(filter);
      });

      return matchesSearch && matchesStatus && matchesColumnFilters;
    });
  }, [columnFilters, rows, search, statusFilter, visibleColumns]);
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim());

  useEffect(() => {
    void loadTaskLine();
  }, []);

  async function loadTaskLine() {
    setIsLoading(true);

    try {
      const response = await fetch("/api/taskline", { cache: "no-store" });
      const result = (await response.json()) as {
        auditLogs?: Array<Record<string, unknown>>;
        error?: string;
        rows?: TaskLineRow[];
      };

      if (!response.ok) {
        setMessage(result.error ?? "Could not load TaskLine.");
        return;
      }

      setRows(result.rows ?? []);
      setAuditLogs((result.auditLogs ?? []).map(formatServerAuditLog));
      setMessage("");
    } catch (error) {
      console.error("TaskLine load error:", error);
      setMessage("Could not load TaskLine.");
    } finally {
      setIsLoading(false);
    }
  }

  function addRow() {
    setEditingRowId(null);
    setFormDraft(createEmptyRow(`draft-${crypto.randomUUID()}`));
  }

  function openEditForm(row: TaskLineRow) {
    setEditingRowId(row.__id);
    setFormDraft({ ...row });
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

      await loadTaskLine();
    } catch (error) {
      console.error("TaskLine save error:", error);
      setMessage("Could not save TaskLine row.");
      return;
    }

    if (editingRowId) {
      addAuditLog({
        action: "taskline.edit_row",
        newValue: getChangedFields(existingRow ?? undefined, formDraft).join(", ") || "Row saved",
        rowLabel: getRowLabel(existingRow ?? undefined, rows)
      });
    } else {
      addAuditLog({ action: "taskline.add_row", newValue: getRowLabel(formDraft, [formDraft]) || "New row added" });
    }

    setEditingRowId(null);
    setFormDraft(null);
  }

  function updateRow(rowId: string, key: string, value: string) {
    const row = rows.find((item) => item.__id === rowId);
    const oldValue = row?.[key] ?? "";

    if (oldValue !== value) {
      addAuditLog({
        action: "taskline.update_cell",
        field: taskLineColumnByKey.get(key)?.label ?? key,
        newValue: value,
        oldValue,
        rowLabel: getRowLabel(row, rows)
      });
    }

    const nextRow = row ? { ...row, [key]: value } : null;
    setRows((current) => current.map((row) => (row.__id === rowId ? { ...row, [key]: value } : row)));
    if (nextRow) void saveInlineRow(nextRow);
  }

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

  async function deleteRow(row: TaskLineRow) {
    if (!window.confirm(`Delete ${getRowLabel(row, rows) || "this TaskLine row"}?`)) {
      return;
    }

    setMessage("Deleting TaskLine row...");

    try {
      const response = await fetch(`/api/taskline?id=${encodeURIComponent(row.__id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setMessage(result.error ?? "Could not delete TaskLine row.");
        return;
      }

      setRows((current) => current.filter((item) => item.__id !== row.__id));
      addAuditLog({ action: "taskline.delete_row", oldValue: JSON.stringify(toDisplayRow(row)), rowLabel: getRowLabel(row, rows) });
      await loadTaskLine();
      setMessage("TaskLine row deleted.");
    } catch (error) {
      console.error("TaskLine delete error:", error);
      setMessage("Could not delete TaskLine row.");
    }
  }

  function viewRowHistory(row: TaskLineRow) {
    setViewMode("audit");
    setMessage(`Showing audit trail. Row selected: ${getRowLabel(row, rows) || "TaskLine row"}.`);
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

  function exportView() {
    const exportRows = filteredRows.map((row, index) =>
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
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const importedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (!importedRows.length) {
      setMessage(`No TaskLine rows found in ${file.name}.`);
      return;
    }

    setMessage(`Importing ${file.name}...`);
    const importRows = importedRows.map((rawRow) => ({
      ...rowFromImport(rawRow),
      import_action: text(rawRow[importActionColumn] || "Add"),
      serial_no: text(rawRow["S. No."] || rawRow["S.No."] || rawRow["Serial No."])
    }));
    const response = await fetch("/api/taskline", {
      body: JSON.stringify({ action: "import", importRows }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as {
      error?: string;
      rows?: TaskLineRow[];
      summary?: { added: number; deleted: number; updated: number };
    };

    if (!response.ok) {
      setMessage(result.error ?? "Could not import TaskLine rows.");
      return;
    }

    setRows(result.rows ?? []);
    await loadTaskLine();
    setMessage(`Imported ${file.name}: ${result.summary?.added ?? 0} added, ${result.summary?.updated ?? 0} updated, ${result.summary?.deleted ?? 0} deleted.`);
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
    <section className="w-full rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-700">TaskLine register</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Task Register</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">{filteredRows.length} visible of {rows.length} task rows</p>
        </div>
        <div className="grid gap-2 text-sm font-black text-slate-700 sm:grid-cols-3 xl:min-w-[520px]">
          <Summary label="Open" value={String(rows.filter((row) => row.status_open_close !== "Close").length)} />
          <Summary label="Closed" value={String(rows.filter((row) => row.status_open_close === "Close").length)} />
          <Summary label="Columns" value={`${visibleColumns.length} / ${taskLineColumns.length}`} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(280px,1fr)_180px_auto]">
        <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
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
          className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="">Status: All</option>
          <option value="Open">Open</option>
          <option value="Close">Close</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <button className={buttonClass("light")} onClick={() => setIsColumnOptionsOpen((current) => !current)} type="button">
              <Settings2 className="size-4" />
              Columns
            </button>
            {isColumnOptionsOpen ? (
              <TaskLineColumnOptionsPanel
                hiddenColumnKeys={hiddenColumnKeys}
                onApply={(layout) => {
                  const normalizedLayout = normalizeTaskLineColumnLayout(layout);
                  setColumnOrder(normalizedLayout.order);
                  setHiddenColumnKeys(new Set(normalizedLayout.hiddenColumnKeys));
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
          <button className={buttonClass("primary")} onClick={addRow} type="button">
            <Plus className="size-4" />
            Add
          </button>
          <button className={buttonClass("dark")} onClick={exportView} type="button">
            <Download className="size-4" />
            Export View
          </button>
          <button className={buttonClass("light")} onClick={downloadTemplate} type="button">Template</button>
          <button className={buttonClass("light")} onClick={() => fileInputRef.current?.click()} type="button">
            <Upload className="size-4" />
            Import
          </button>
          {hasActiveColumnFilters ? (
            <button className={buttonClass("light")} onClick={() => setColumnFilters({})} type="button">Clear column filters</button>
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

      <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <ViewButton active={viewMode === "register"} label="Register" onClick={() => setViewMode("register")} />
        <ViewButton active={viewMode === "audit"} label={`Audit Trail (${auditLogs.length})`} onClick={() => setViewMode("audit")} />
      </div>

      {message ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">{message}</p>
      ) : null}

      {viewMode === "register" ? (
      <div className="mt-4">
        <p className="mb-2 text-sm font-bold text-slate-600">
          {isLoading ? "Loading TaskLine rows..." : `Showing 1-${filteredRows.length} of ${filteredRows.length} matching task rows`}
        </p>
        <div className="max-h-[calc(100vh-260px)] overflow-auto rounded-md border border-slate-200 bg-white">
          <table className="table-fixed border-collapse text-left text-sm" style={{ minWidth: tableWidth, width: tableWidth }}>
            <colgroup>
              {visibleColumns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-950 text-xs font-black uppercase text-white">
            <tr>
              <th className="border-r border-white/10 px-3 py-3" style={{ width: actionColumnWidth }}>Actions</th>
              {visibleColumns.map((column) => (
                <th className="border-r border-white/10 px-3 py-3 last:border-r-0" key={column.key}>{column.label}</th>
              ))}
            </tr>
            <tr className="bg-slate-900">
              <th className="border-r border-white/10 px-2 py-2" />
              {visibleColumns.map((column) => (
                  <th className="border-r border-white/10 px-2 py-2 last:border-r-0" key={`filter-${column.key}`}>
                    {column.key === "serial_no" ? null : (
                      <input
                        aria-label={`Filter ${column.label}`}
                        className="h-8 w-full rounded-md border border-white/10 bg-white px-2 text-xs font-bold normal-case text-slate-950 outline-none"
                        onChange={(event) => setColumnFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                        placeholder="Filter"
                        value={columnFilters[column.key] ?? ""}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={visibleColumns.length + 1}>Loading TaskLine rows...</td></tr>
              ) : filteredRows.length ? filteredRows.map((row, rowIndex) => (
                <tr className="border-b border-slate-100 last:border-b-0" key={row.__id}>
                  <td className="border-r border-slate-100 px-2 py-2">
                    <div className="flex items-center gap-1">
                      <button className="inline-flex size-8 items-center justify-center rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => openEditForm(row)} title="Edit row" type="button">
                        <Pencil className="size-4" />
                      </button>
                      <button className="inline-flex size-8 items-center justify-center rounded-md border border-teal-200 text-teal-700 hover:bg-teal-50" onClick={() => viewRowHistory(row)} title="View history" type="button">
                        <History className="size-4" />
                      </button>
                      <button className="inline-flex size-8 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => deleteRow(row)} title="Delete row" type="button">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                  {visibleColumns.map((column) => (
                    <TaskLineCell
                      column={column}
                      key={`${row.__id}-${column.key}`}
                      onChange={(value) => updateRow(row.__id, column.key, value)}
                      row={row}
                      serialNumber={rowIndex + 1}
                    />
                  ))}
                </tr>
              )) : (
                <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={visibleColumns.length + 1}>No TaskLine rows match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {viewMode === "audit" ? (
        <TaskLineAuditTable logs={auditLogs} />
      ) : null}

      {formDraft ? (
        <TaskLineForm
          draft={formDraft}
          isEdit={Boolean(editingRowId)}
          onChange={(key, value) => setFormDraft((current) => (current ? { ...current, [key]: value } : current))}
          onClose={() => {
            setEditingRowId(null);
            setFormDraft(null);
          }}
          onSubmit={saveFormDraft}
        />
      ) : null}
    </section>
  );
}

function TaskLineCell({
  column,
  onChange,
  row,
  serialNumber
}: {
  column: TaskLineColumn;
  onChange: (value: string) => void;
  row: TaskLineRow;
  serialNumber: number;
}) {
  if (column.key === "serial_no") {
    return (
      <td className="border-r border-slate-100 px-2 py-2 last:border-r-0">
        <span className="block h-8 px-1.5 py-1.5 font-semibold text-slate-700">{serialNumber}</span>
      </td>
    );
  }

  if (column.type === "select") {
    return (
      <td className="border-r border-slate-100 px-2 py-2 last:border-r-0">
        <select
          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
          onChange={(event) => onChange(event.target.value)}
          value={row[column.key] ?? ""}
        >
          {statusOptions.map((option) => (
            <option key={option} value={option}>{option || "-"}</option>
          ))}
        </select>
      </td>
    );
  }

  return (
    <td className="border-r border-slate-100 px-2 py-2 last:border-r-0">
      <input
        className="h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-200 hover:bg-slate-50 focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
        onChange={(event) => onChange(event.target.value)}
        type={column.type === "date" ? "date" : column.type === "number" || column.type === "money" ? "number" : "text"}
        value={row[column.key] ?? ""}
      />
    </td>
  );
}

function TaskLineForm({
  draft,
  isEdit,
  onChange,
  onClose,
  onSubmit
}: {
  draft: TaskLineRow;
  isEdit: boolean;
  onChange: (key: string, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-6">
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
            {taskLineColumns.filter((column) => column.key !== "serial_no").map((column) => (
              <label className={["remarks", "issue", "document_link", "el_reference", "fee_comments"].includes(column.key) ? "xl:col-span-2" : ""} key={column.key}>
                <span className="text-[10px] font-black uppercase text-slate-500">{column.label}</span>
                {column.type === "select" ? (
                  <select
                    className={formControlClass}
                    onChange={(event) => onChange(column.key, event.target.value)}
                    value={draft[column.key] ?? ""}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>{option || "-"}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={formControlClass}
                    onChange={(event) => onChange(column.key, event.target.value)}
                    type={column.type === "date" ? "date" : column.type === "number" || column.type === "money" ? "number" : "text"}
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

const formControlClass = "mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100";

function TaskLineColumnOptionsPanel({
  hiddenColumnKeys,
  onApply,
  onClose,
  orderedColumns
}: {
  hiddenColumnKeys: Set<string>;
  onApply: (layout: TaskLineColumnLayout) => void;
  onClose: () => void;
  orderedColumns: TaskLineColumn[];
}) {
  const [draftHiddenColumnKeys, setDraftHiddenColumnKeys] = useState<Set<string>>(() => new Set(hiddenColumnKeys));
  const [draftOrder, setDraftOrder] = useState<string[]>(() => orderedColumns.map((column) => column.key));
  const draftColumns = useMemo(
    () => draftOrder.map((key) => taskLineColumnByKey.get(key)).filter((column): column is TaskLineColumn => Boolean(column)),
    [draftOrder]
  );

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
          <p className="mt-1 text-sm font-bold text-slate-500">Hide fields and move columns up or down.</p>
        </div>
        <button className="rounded-md border border-slate-200 px-2 py-1 text-xs font-black text-slate-700" onClick={onClose} type="button">Close</button>
      </div>
      <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {draftColumns.map((column, index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border border-slate-200 px-2 py-2" key={column.key}>
            <label className="flex min-w-0 cursor-pointer items-center gap-2">
              <input checked={!draftHiddenColumnKeys.has(column.key)} onChange={() => toggleColumn(column)} type="checkbox" />
              <span className="min-w-0 truncate text-sm font-bold text-slate-700">{column.label}</span>
            </label>
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
          }}
          type="button"
        >
          Reset
        </button>
        <button className={buttonClass("primary")} onClick={() => onApply({ hiddenColumnKeys: Array.from(draftHiddenColumnKeys), order: draftOrder })} type="button">
          Apply
        </button>
      </div>
    </div>
  );
}

function TaskLineAuditTable({ logs }: { logs: TaskLineAuditLog[] }) {
  return (
    <section className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <History className="size-4 text-rose-700" />
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">Edit History</h3>
      </div>
      <div className="max-h-[calc(100vh-250px)] overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-950 text-xs font-black uppercase text-white">
            <tr>
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Action</th>
              <th className="px-3 py-3">Row</th>
              <th className="px-3 py-3">Field</th>
              <th className="px-3 py-3">Old Value</th>
              <th className="px-3 py-3">New Value</th>
            </tr>
          </thead>
          <tbody>
            {logs.length ? logs.map((log) => (
              <tr className="border-b border-slate-100 last:border-b-0" key={log.id}>
                <td className="px-3 py-3 text-xs font-bold text-slate-500">{formatAuditTime(log.createdAt)}</td>
                <td className="px-3 py-3 font-black text-slate-900">{formatAuditAction(log.action)}</td>
                <td className="px-3 py-3 font-semibold text-slate-700">{log.rowLabel || "-"}</td>
                <td className="px-3 py-3 font-semibold text-slate-700">{log.field || "-"}</td>
                <td className="max-w-[260px] truncate px-3 py-3 font-semibold text-slate-500" title={log.oldValue || ""}>{log.oldValue || "-"}</td>
                <td className="max-w-[320px] truncate px-3 py-3 font-semibold text-slate-900" title={log.newValue || ""}>{log.newValue || "-"}</td>
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-8 text-center font-bold text-slate-500" colSpan={6}>No TaskLine edit history yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
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
    return `${base} bg-teal-700 text-white hover:bg-teal-800`;
  }
  if (tone === "dark") {
    return `${base} bg-slate-950 text-white hover:bg-slate-800`;
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
      row[column.key] = text(rawRow[column.label]);
      return row;
    },
    { __id: `import-${crypto.randomUUID()}` }
  );
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

  return {
    action: text(log.action),
    createdAt: text(log.created_at),
    field: getAuditFieldSummary(oldValue, newValue),
    id: text(log.id) || crypto.randomUUID(),
    newValue: summarizeAuditValue(newValue),
    oldValue: summarizeAuditValue(oldValue),
    rowLabel: getAuditRowLabel(oldValue || newValue)
  };
}

function readAuditValue(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as { data?: TaskLineRow } & TaskLineRow;
  return record.data ?? record;
}

function getAuditFieldSummary(oldValue: TaskLineRow | null, newValue: TaskLineRow | null) {
  if (!oldValue || !newValue) {
    return "";
  }

  return taskLineColumns
    .filter((column) => text(oldValue[column.key]) !== text(newValue[column.key]))
    .map((column) => column.label)
    .slice(0, 6)
    .join(", ");
}

function summarizeAuditValue(value: TaskLineRow | null) {
  if (!value) {
    return "";
  }

  const summary = [value.task, value.entity, value.status_open_close].map(text).filter(Boolean).join(" | ");
  return summary || JSON.stringify(toDisplayRow(value));
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
  const savedOrder = Array.isArray(layout.order) ? layout.order.filter((key) => knownColumnKeys.has(key)) : [];
  const order = [...savedOrder, ...defaultTaskLineColumnOrder.filter((key) => !savedOrder.includes(key))];
  const hiddenColumnKeys = Array.isArray(layout.hiddenColumnKeys)
    ? layout.hiddenColumnKeys.filter((key) => knownColumnKeys.has(key))
    : [];

  return { hiddenColumnKeys, order };
}

function saveTaskLineColumnLayout(layout: TaskLineColumnLayout) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(taskLineColumnLayoutStorageKey, JSON.stringify(normalizeTaskLineColumnLayout(layout)));
}

function getSavedTaskLineColumnLayout() {
  if (typeof window === "undefined") {
    return { hiddenColumnKeys: [], order: defaultTaskLineColumnOrder };
  }

  try {
    const savedLayout = window.localStorage.getItem(taskLineColumnLayoutStorageKey);
    return savedLayout
      ? normalizeTaskLineColumnLayout(JSON.parse(savedLayout) as Partial<TaskLineColumnLayout>)
      : { hiddenColumnKeys: [], order: defaultTaskLineColumnOrder };
  } catch {
    return { hiddenColumnKeys: [], order: defaultTaskLineColumnOrder };
  }
}

function text(value: unknown) {
  return String(value ?? "").trim();
}
