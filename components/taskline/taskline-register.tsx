"use client";

import { ArrowDown, ArrowUp, Download, Filter, History, Pencil, Plus, Search, Settings2, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
const taskLineImportBatchSize = 100;
const taskLinePageSize = 100;
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
  const [sortState, setSortState] = useState<{ dir: "asc" | "desc"; key: string } | null>(null);
  const [valueFilters, setValueFilters] = useState<Record<string, string[]>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState<string[]>([]);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterMenuPos, setFilterMenuPos] = useState<{ left: number; maxHeight: number; top: number } | null>(null);
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
  const [tablePage, setTablePage] = useState(1);
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

      return matchesSearch && matchesStatus && matchesColumnFilters && matchesValueFilters;
    });

    if (sortState) {
      const factor = sortState.dir === "asc" ? 1 : -1;
      return [...result].sort(
        (first, second) =>
          factor * text(first[sortState.key]).localeCompare(text(second[sortState.key]), undefined, { numeric: true })
      );
    }

    return result;
  }, [columnFilters, rows, search, sortState, statusFilter, valueFilters, visibleColumns]);
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim());
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / taskLinePageSize));
  const pagedRows = useMemo(() => {
    const startIndex = (tablePage - 1) * taskLinePageSize;
    return filteredRows.slice(startIndex, startIndex + taskLinePageSize);
  }, [filteredRows, tablePage]);
  const pageStart = filteredRows.length ? (tablePage - 1) * taskLinePageSize + 1 : 0;
  const pageEnd = Math.min(tablePage * taskLinePageSize, filteredRows.length);

  const dataHydratedRef = useRef(false);

  useEffect(() => {
    void loadTaskLine();
  }, []);

  useEffect(() => {
    setTablePage(1);
  }, [columnFilters, search, statusFilter]);

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
    const maxHeight = Math.max(160, window.innerHeight - top - 90);
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

  async function loadTaskLine() {
    const cached = !dataHydratedRef.current
      ? getCached<{ auditLogs?: Array<Record<string, unknown>>; rows?: TaskLineRow[] }>("taskline")
      : undefined;
    dataHydratedRef.current = true;

    if (cached) {
      setRows(cached.rows ?? []);
      setAuditLogs((cached.auditLogs ?? []).map(formatServerAuditLog));
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

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

      setCached("taskline", { auditLogs: result.auditLogs, rows: result.rows });
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

      const importRows = importedRows
        .map((rawRow) => ({
          ...rowFromImport(rawRow),
          import_action: text(rawRow[importActionColumn] || "Add"),
          serial_no: text(rawRow["S. No."] || rawRow["S.No."] || rawRow["Serial No."])
        }))
        .filter(hasTaskLineValue);

      if (!importRows.length) {
        setMessage(`No filled TaskLine rows found in ${file.name}. Please enter data below the headers before importing.`);
        return;
      }

      const summary = { added: 0, deleted: 0, updated: 0 };

      for (let index = 0; index < importRows.length; index += taskLineImportBatchSize) {
        const batch = importRows.slice(index, index + taskLineImportBatchSize);
        const result = await postTaskLineImportBatch(batch);
        summary.added += result.summary?.added ?? 0;
        summary.updated += result.summary?.updated ?? 0;
        summary.deleted += result.summary?.deleted ?? 0;
        setMessage(`Importing ${file.name}: ${Math.min(index + taskLineImportBatchSize, importRows.length)} of ${importRows.length} rows processed...`);
      }

      await loadTaskLine();
      setMessage(`Imported ${file.name}: ${summary.added} added, ${summary.updated} updated, ${summary.deleted} deleted.`);
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
    <section className="w-full rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-700">TaskLine register</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Task Register</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">{filteredRows.length} visible of {rows.length} task rows</p>
        </div>
        <div className="grid gap-2 text-sm font-black text-slate-700 sm:grid-cols-4 xl:min-w-[680px]">
          <Summary label="Total Entries" value={String(rows.length)} />
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
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-slate-600">
            {isLoading ? "Loading TaskLine rows..." : `Showing ${pageStart}-${pageEnd} of ${filteredRows.length} matching task rows · ${rows.length} total entries`}
          </p>
          <div className="flex items-center gap-2">
            <button
              className={buttonClass("light")}
              disabled={tablePage <= 1 || isLoading}
              onClick={() => setTablePage((currentPage) => Math.max(1, currentPage - 1))}
              type="button"
            >
              Previous
            </button>
            <span className="inline-flex h-11 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
              Page {tablePage} of {pageCount}
            </span>
            <button
              className={buttonClass("light")}
              disabled={tablePage >= pageCount || isLoading}
              onClick={() => setTablePage((currentPage) => Math.min(pageCount, currentPage + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
        <div className="max-h-[calc(100vh-260px)] overflow-auto rounded-md border border-slate-200 bg-white">
          <table className="table-fixed border-collapse text-left text-sm" style={{ minWidth: tableWidth, width: tableWidth }}>
            <colgroup>
              <col style={{ width: actionColumnWidth }} />
              {visibleColumns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
            <tr>
              <th className="border-r border-white/10 px-3 py-3" style={{ width: actionColumnWidth }}>Actions</th>
              {visibleColumns.map((column) => {
                const isAsc = sortState?.key === column.key && sortState.dir === "asc";
                const isDesc = sortState?.key === column.key && sortState.dir === "desc";
                const hasValueFilter = Boolean(valueFilters[column.key]);
                return (
                  <th className="border-r border-white/10 px-3 py-3 last:border-r-0" key={column.key}>
                    <div className="flex items-center gap-1">
                      <button
                        className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left"
                        onClick={() => toggleSort(column.key)}
                        title={`Sort by ${column.label}`}
                        type="button"
                      >
                        <span className="min-w-0 whitespace-normal break-words leading-tight">{column.label}</span>
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
                        columnLabel={column.label}
                        draft={filterDraft}
                        hasFilter={hasValueFilter}
                        menuPos={filterMenuPos}
                        onApply={() => applyColumnFilter(column.key)}
                        onCancel={closeColumnFilter}
                        onClear={() => clearColumnFilter(column.key)}
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
              <th className="border-r border-slate-200 px-2 py-2" />
              {visibleColumns.map((column) => (
                  <th className="border-r border-slate-200 px-2 py-2 last:border-r-0" key={`filter-${column.key}`}>
                    {column.key === "serial_no" ? null : (
                      <input
                        aria-label={`Filter ${column.label}`}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold normal-case text-slate-950 outline-none focus:border-navy-400"
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
              ) : pagedRows.length ? pagedRows.map((row, rowIndex) => (
                <tr className="border-b border-slate-100 last:border-b-0" key={row.__id}>
                  <td className="border-r border-slate-100 px-2 py-2">
                    <div className="flex items-center gap-1">
                      <button className="inline-flex size-8 items-center justify-center rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => openEditForm(row)} title="Edit row" type="button">
                        <Pencil className="size-4" />
                      </button>
                      <button className="inline-flex size-8 items-center justify-center rounded-md border border-navy-200 text-navy-700 hover:bg-navy-50" onClick={() => viewRowHistory(row)} title="View history" type="button">
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
                      serialNumber={(tablePage - 1) * taskLinePageSize + rowIndex + 1}
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
        placeholder={column.type === "date" ? "dd-mm-yyyy" : undefined}
        type={column.type === "number" || column.type === "money" ? "number" : "text"}
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
          <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
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
                <td className="max-w-[320px] px-3 py-3 font-semibold text-slate-500" title={log.oldValue || ""}>{log.oldValue || "-"}</td>
                <td className="max-w-[520px] whitespace-normal px-3 py-3 font-semibold leading-6 text-slate-900" title={log.newValue || ""}>{log.newValue || "-"}</td>
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
        active ? "bg-navy-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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

function TaskLineFilterMenu({
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
  onToggleValue,
  search,
  visibleOptions
}: {
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
  if (typeof document === "undefined") {
    return null;
  }

  const allVisibleSelected = visibleOptions.length > 0 && visibleOptions.every((value) => draft.includes(value));
  const someVisibleSelected = visibleOptions.some((value) => draft.includes(value)) && !allVisibleSelected;

  return createPortal(
    <div
      className="fixed z-[1000] w-72 overflow-hidden rounded-lg border border-slate-300 bg-white p-2 text-left text-slate-900 shadow-2xl"
      style={{ left: menuPos.left, top: menuPos.top }}
    >
      <div className="space-y-1 border-b border-slate-200 pb-2">
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
        className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
        disabled={!hasFilter}
        onClick={onClear}
        type="button"
      >
        <X className="size-4" />
        Clear Filter From &quot;{columnLabel}&quot;
      </button>

      <div className="mt-2 flex justify-end gap-2">
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="inline-flex h-9 items-center justify-center rounded-md bg-navy-700 px-4 text-sm font-semibold text-white transition hover:bg-navy-800" onClick={onApply} type="button">
          OK
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5">
        <Search className="size-4 text-slate-400" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          value={search}
        />
      </div>

      <div className="mt-2 overflow-y-auto overscroll-contain border border-slate-200 bg-slate-50 p-2" style={{ maxHeight: menuPos.maxHeight }}>
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
