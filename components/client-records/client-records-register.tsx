"use client";

import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Download,
  Edit3,
  Filter,
  History,
  Plus,
  RefreshCw,
  Menu,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCached, setCached } from "@/lib/data-cache";
import { useRegisterEditAccess, viewOnlyRegisterMessage } from "@/lib/use-register-access";
import * as XLSX from "xlsx-js-style";

type RegisterRow = Record<string, string | number>;
type AuditLog = {
  action: string;
  actor_user_id: string | null;
  created_at: string;
  id: string;
  new_value: unknown;
  old_value: unknown;
};
type EditorState = { row: RegisterRow; rowId?: string };
type SortState = { column: string; direction: "asc" | "desc" } | null;
type SaveActionResult = {
  auditLogs?: AuditLog[];
  error?: string;
  rows?: RegisterRow[];
  summary?: { added?: number; deleted?: number; skipped?: number; unchanged?: number; updated?: number };
  trashRows?: RegisterRow[];
};

const columns = [
  "S.no.",
  "Group",
  "Particulars",
  "Email ID",
  "POC Name",
  "POC Contact no.",
  "Address",
  "State",
  "Country",
  "Registration Type",
  "GSTIN/UIN",
  "PAN/IT No.",
  "Client Type"
];
const importActionColumn = "Import Action";
const importActionOptions = ["Add", "Update", "Delete"];
const maxDeleteRows = 10;
const clientPageSize = 200;
const clientSelectionColumnWidth = 40;
const clientActionColumnWidth = 112;
const clientColumnWidths: Record<string, number> = {
  "S.no.": 84,
  Group: 120,
  Particulars: 200,
  "Email ID": 200,
  "POC Name": 150,
  "POC Contact no.": 145,
  Address: 220,
  State: 130,
  Country: 110,
  "Registration Type": 150,
  "GSTIN/UIN": 175,
  "PAN/IT No.": 140,
  "Client Type": 130
};
const buttonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50";

export function ClientRecordsRegister() {
  const { canEditRegister, canEditRegisterRef } = useRegisterEditAccess();
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [trashRows, setTrashRows] = useState<RegisterRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [valueFilters, setValueFilters] = useState<Record<string, string[]>>({});
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState<string[]>([]);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterMenuPos, setFilterMenuPos] = useState<{ left: number; maxHeight: number; top: number } | null>(null);
  const [sortState, setSortState] = useState<SortState>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dataHydratedRef = useRef(false);

  useEffect(() => {
    void loadRows();
  }, []);

  const visibleRows = useMemo<RegisterRow[]>(() => withSerial(rows), [rows]);
  const filteredRows = useMemo<RegisterRow[]>(() => {
    const searchValue = search.trim().toLowerCase();
    let nextRows = visibleRows.filter((row) => {
      const matchesSearch =
        !searchValue ||
        columns.some((column) => String(row[column] ?? "").toLowerCase().includes(searchValue));
      const matchesTextFilters = columns.every((column) => {
        const filter = String(columnFilters[column] ?? "").trim().toLowerCase();
        return !filter || String(row[column] ?? "").toLowerCase().includes(filter);
      });
      const matchesValueFilters = columns.every((column) => {
        const selected = valueFilters[column];
        return !selected || selected.includes(String(row[column] ?? ""));
      });

      return matchesSearch && matchesTextFilters && matchesValueFilters;
    });

    if (sortState) {
      nextRows = [...nextRows].sort((first, second) => {
        const left = String(first[sortState.column] ?? "");
        const right = String(second[sortState.column] ?? "");
        return sortState.direction === "asc"
          ? left.localeCompare(right, undefined, { numeric: true })
          : right.localeCompare(left, undefined, { numeric: true });
      });
    }

    return nextRows;
  }, [columnFilters, search, sortState, valueFilters, visibleRows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / clientPageSize));
  const pagedRows = useMemo(() => {
    const start = (tablePage - 1) * clientPageSize;
    return filteredRows.slice(start, start + clientPageSize);
  }, [filteredRows, tablePage]);
  const selectedPageCount = pagedRows.filter((row) => selectedIds.has(String(row.id))).length;
  const allPageRowsSelected = pagedRows.length > 0 && selectedPageCount === pagedRows.length;
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim()) || Object.keys(valueFilters).length > 0;

  useEffect(() => {
    setTablePage(1);
  }, [columnFilters, search, sortState, valueFilters]);

  useEffect(() => {
    setTablePage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  async function loadRows() {
    const cached = !dataHydratedRef.current
      ? getCached<{ auditLogs?: AuditLog[]; rows?: RegisterRow[]; trashRows?: RegisterRow[] }>("client-records")
      : undefined;
    dataHydratedRef.current = true;

    if (cached) {
      setRows(cached.rows ?? []);
      setTrashRows(cached.trashRows ?? []);
      setAuditLogs(cached.auditLogs ?? []);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    const response = await fetch("/api/client-records/managed", { cache: "no-store" });
    const result = (await response.json()) as {
      auditLogs?: AuditLog[];
      error?: string;
      rows?: RegisterRow[];
      trashRows?: RegisterRow[];
    };

    if (!response.ok) {
      setMessage(result.error ?? "Could not load client records.");
      setIsLoading(false);
      return;
    }

    // Cache rows only (no audit logs): audit history blobs regularly pushed
    // large registers over the localStorage quota, which silently disabled
    // the instant-render cache. Rows are what the table needs on first paint.
    setCached("client-records", { rows: result.rows, trashRows: result.trashRows });
    setRows(result.rows ?? []);
    setTrashRows(result.trashRows ?? []);
    setAuditLogs(result.auditLogs ?? []);
    setSelectedIds(new Set());
    setMessage("");
    setIsLoading(false);
  }

  async function saveAction(body: Record<string, unknown>, successMessage: string | ((result: SaveActionResult) => string)) {
    if (!canEditRegisterRef.current) {
      setMessage(viewOnlyRegisterMessage);
      return false;
    }

    const response = await fetch("/api/client-records/managed", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as SaveActionResult;

    if (!response.ok) {
      setMessage(result.error ?? "Could not save client records.");
      return false;
    }

    setRows(result.rows ?? []);
    setTrashRows(result.trashRows ?? []);
    setAuditLogs(result.auditLogs ?? []);
    setSelectedIds(new Set());
    setMessage(typeof successMessage === "function" ? successMessage(result) : successMessage);
    return true;
  }

  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) {
        setMessage("The selected file does not contain a worksheet.");
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json<Array<string | number>>(worksheet, {
        blankrows: false,
        defval: "",
        header: 1
      });
      const headerIndex = rawRows.findIndex((row) => {
        const headers = new Set(row.map((value) => normalizeHeader(String(value))));
        return headers.has(normalizeHeader(importActionColumn)) && headers.has(normalizeHeader("Particulars"));
      });
      if (headerIndex < 0) {
        setMessage(`Could not find the "${importActionColumn}" and "Particulars" headers in ${file.name}.`);
        return;
      }
      const headerRow = rawRows[headerIndex].map((value) => String(value).trim());
      const nextRows = rawRows
        .slice(headerIndex + 1)
        .filter((row) => row.some((value) => String(value).trim()))
        .map((row, rowIndex) =>
          [importActionColumn, ...columns].reduce<RegisterRow>((record, column) => {
            if (column === importActionColumn) {
              const sourceIndex = headerRow.findIndex((header) => normalizeHeader(header) === normalizeHeader(importActionColumn));
              record[column] = normalizeImportAction(row[sourceIndex >= 0 ? sourceIndex : 0]);
              return record;
            }

            if (column === "S.no.") {
              record[column] = rowIndex + 1;
              return record;
            }

            const sourceIndex = headerRow.findIndex((header) => normalizeHeader(header) === normalizeHeader(column));
            record[column] = sourceIndex >= 0 ? row[sourceIndex] ?? "" : "";
            return record;
          }, {})
        );
      let unchanged = 0;
      const changedRows = nextRows.filter((row) => {
        if (normalizeImportAction(row[importActionColumn]) !== "Update") return true;
        const existing = findMatchingClientRow(rows, row);
        if (existing && clientRowsMatch(existing, row)) {
          unchanged += 1;
          return false;
        }
        return true;
      });

      if (!changedRows.length) {
        setMessage(`No changes found in ${file.name}. ${unchanged} unchanged row${unchanged === 1 ? " was" : "s were"} skipped.`);
        return;
      }

      setMessage(`Importing ${changedRows.length} changed client record${changedRows.length === 1 ? "" : "s"}...`);
      await saveAction(
        { action: "import", rows: changedRows },
        (result) => {
          const summary = result.summary ?? {};
          const unchangedTotal = unchanged + (summary.unchanged ?? 0);
          return `Imported ${file.name}: ${summary.added ?? 0} added, ${summary.updated ?? 0} updated, ${summary.deleted ?? 0} deleted; ${unchangedTotal} unchanged and ${summary.skipped ?? 0} unmatched skipped.`;
        }
      );
    } catch (error) {
      console.error("Client records import error:", error);
      setMessage("Could not import the selected Excel file.");
    } finally {
      event.target.value = "";
    }
  }

  function exportExcel() {
    const exportColumns = [importActionColumn, ...columns];
    const exportRows = filteredRows.length
      ? filteredRows.map((row) => ({ [importActionColumn]: "Update", ...stripInternalFields(row) }))
      : [createBlankRow()];
    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: exportColumns });
    worksheet["!cols"] = exportColumns.map((column) => ({ wch: Math.max(14, column.length + 3) }));
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({ e: { c: exportColumns.length - 1, r: Math.max(exportRows.length, 1) }, s: { c: 0, r: 0 } })
    };
    addImportActionDropdown(worksheet, Math.max(exportRows.length + 100, 500));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Client Records");
    XLSX.writeFile(workbook, "workline-client-records.xlsx");
    setMessage(filteredRows.length ? `Exported ${filteredRows.length} client records.` : "Exported a blank template.");
  }

  function toggleSort(column: string) {
    setSortState((current) => {
      if (current?.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }

  function uniqueValuesForColumn(column: string) {
    return Array.from(new Set(visibleRows.map((row) => String(row[column] ?? ""))))
      .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
  }

  const openColumnOptions = useMemo(
    () => (openFilterColumn ? uniqueValuesForColumn(openFilterColumn) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openFilterColumn, visibleRows]
  );
  const visibleFilterOptions = useMemo(() => {
    const query = filterSearch.trim().toLowerCase();
    return query ? openColumnOptions.filter((value) => value.toLowerCase().includes(query)) : openColumnOptions;
  }, [filterSearch, openColumnOptions]);

  function openColumnFilter(column: string, anchor: HTMLElement) {
    const options = uniqueValuesForColumn(column);
    setOpenFilterColumn(column);
    setFilterSearch("");
    setFilterDraft(valueFilters[column] ? [...valueFilters[column]] : options);
    const rect = anchor.getBoundingClientRect();
    const width = 288;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.bottom + 4;
    setFilterMenuPos({ left, maxHeight: Math.max(240, window.innerHeight - top - 16), top });
  }

  const closeColumnFilter = useCallback(() => {
    setOpenFilterColumn(null);
    setFilterMenuPos(null);
  }, []);

  useEffect(() => {
    if (!openFilterColumn) {
      return;
    }

    function handleFilterKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeColumnFilter();
      }
    }

    function handleFilterPointerDown(event: PointerEvent) {
      const target = event.target;

      if (target instanceof Element && target.closest('[data-client-filter-menu="true"]')) {
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
  }, [closeColumnFilter, openFilterColumn]);

  function applyColumnFilter(column: string) {
    const options = uniqueValuesForColumn(column);
    setValueFilters((current) => {
      const next = { ...current };
      if (filterDraft.length >= options.length) delete next[column];
      else next[column] = [...filterDraft];
      return next;
    });
    closeColumnFilter();
  }

  function clearColumnFilter(column: string) {
    setValueFilters((current) => {
      const next = { ...current };
      delete next[column];
      return next;
    });
    closeColumnFilter();
  }

  function toggleDraftValue(value: string) {
    setFilterDraft((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function toggleVisibleDraftValues() {
    const allSelected = visibleFilterOptions.every((value) => filterDraft.includes(value));
    setFilterDraft((current) => {
      if (allSelected) return current.filter((value) => !visibleFilterOptions.includes(value));
      return Array.from(new Set([...current, ...visibleFilterOptions]));
    });
  }

  function toggleRowSelection(rowId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
        return next;
      }
      next.add(rowId);
      return next;
    });
  }

  function togglePageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allPageRowsSelected) pagedRows.forEach((row) => next.delete(String(row.id)));
      else pagedRows.forEach((row) => next.add(String(row.id)));
      return next;
    });
  }

  async function deleteSelectedRows() {
    const ids = Array.from(selectedIds);

    if (!ids.length || ids.length > maxDeleteRows || isBulkDeleting) return;

    if (!window.confirm(`Move ${ids.length} client record(s) to trash?`)) return;

    setIsBulkDeleting(true);
    try {
      await saveAction({ action: "delete", rowIds: ids }, `Moved ${ids.length} client record(s) to trash.`);
    } finally {
      setIsBulkDeleting(false);
    }
  }

  async function deleteRow(row: RegisterRow) {
    const name = String(row.Particulars || "this client record");
    if (!window.confirm(`Move ${name} to trash?`)) return;
    await saveAction({ action: "delete", rowIds: [String(row.id)] }, `Moved ${name} to trash.`);
  }

  function viewRowHistory(row: RegisterRow) {
    setIsAuditOpen(true);
    setMessage(`Showing audit history for ${String(row.Particulars || "the selected client record")}.`);
  }

  async function restoreRow(row: RegisterRow) {
    await saveAction({ action: "restore", rowIds: [String(row.id)] }, "Restored client record from trash.");
  }

  async function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editor) return;

    const action = editor.rowId ? "update" : "add";
    const saved = await saveAction(
      { action, row: editor.row, rowId: editor.rowId },
      editor.rowId ? "Updated client record." : "Added client record."
    );

    if (saved) setEditor(null);
  }

  return (
    <section className="w-full rounded-lg border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="shrink-0">
          <h2 className="text-lg font-black leading-tight text-slate-950">Client Records</h2>
          <p className="text-xs font-bold text-slate-500">
            {columns.length} columns · {isLoading ? "loading" : `${filteredRows.length.toLocaleString()} of ${rows.length.toLocaleString()} rows${hasActiveColumnFilters || search ? " (filtered)" : ""}`}
          </p>
        </div>

        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search className="size-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Universal search"
            value={search}
          />
        </label>

        <Link
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          href="/"
        >
          <ArrowLeft className="size-4" />
          Workspace
        </Link>

        <div className="relative shrink-0">
          <input accept=".csv,.xls,.xlsx" className="hidden" onChange={importExcel} ref={fileInputRef} type="file" />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-navy-700 px-4 text-sm font-black text-white ring-1 ring-navy-900 transition hover:bg-navy-600" onClick={() => setIsActionsOpen((current) => !current)} type="button">
            <Menu className="size-4" />
            Actions
          </button>
          {isActionsOpen ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setIsActionsOpen(false)} />
              <div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-2xl">
                <ClientMenuItem icon={Plus} label="Add" onClick={() => { setIsActionsOpen(false); setEditor({ row: createBlankRow() }); }} />
                {hasActiveColumnFilters ? (
                  <ClientMenuItem icon={X} label="Clear column filters" onClick={() => { setIsActionsOpen(false); setColumnFilters({}); setValueFilters({}); }} />
                ) : null}
                <ClientMenuItem icon={sortState?.direction === "desc" ? ArrowDown : ArrowUp} label="Reset sort" onClick={() => { setIsActionsOpen(false); setSortState(null); }} />
                <ClientMenuItem icon={Upload} label="Import Excel" onClick={() => { setIsActionsOpen(false); fileInputRef.current?.click(); }} />
                <ClientMenuItem icon={Download} label="Export Excel" onClick={() => { setIsActionsOpen(false); exportExcel(); }} />
                <ClientMenuItem icon={Trash2} label="Trash" onClick={() => { setIsActionsOpen(false); setIsTrashOpen((current) => !current); }} />
                <ClientMenuItem icon={History} label="Audit" onClick={() => { setIsActionsOpen(false); setIsAuditOpen((current) => !current); }} />
                <ClientMenuItem icon={RefreshCw} label="Refresh" onClick={() => { setIsActionsOpen(false); void loadRows(); }} />
              </div>
            </>
          ) : null}
        </div>
      </div>


      {!canEditRegister ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          {viewOnlyRegisterMessage}
        </p>
      ) : null}

      {message ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
          {message}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-1.5">
        <button
          className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!selectedIds.size || selectedIds.size > maxDeleteRows || isBulkDeleting || isLoading}
          onClick={() => void deleteSelectedRows()}
          title={`Delete up to ${maxDeleteRows} selected client records`}
          type="button"
        >
          <Trash2 className="size-3.5" />
          {isBulkDeleting ? "Deleting..." : `Delete selected (${selectedIds.size}/${maxDeleteRows})`}
        </button>
        <button className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-40" disabled={tablePage <= 1 || isLoading} onClick={() => setTablePage((page) => Math.max(1, page - 1))} type="button">Prev</button>
        <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">Page {tablePage} of {pageCount}</span>
        <button className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-40" disabled={tablePage >= pageCount || isLoading} onClick={() => setTablePage((page) => Math.min(pageCount, page + 1))} type="button">Next</button>
      </div>

      <div className="mt-2 max-h-[calc(100vh-135px)] overflow-auto rounded-md border border-slate-200 bg-white">
        <table className="table-fixed border-collapse text-left text-sm" style={{ minWidth: clientSelectionColumnWidth + clientActionColumnWidth + columns.reduce((total, column) => total + clientColumnWidths[column], 0), width: clientSelectionColumnWidth + clientActionColumnWidth + columns.reduce((total, column) => total + clientColumnWidths[column], 0) }}>
          <colgroup>
            <col style={{ width: clientSelectionColumnWidth }} />
            <col style={{ width: clientActionColumnWidth }} />
            {columns.map((column) => <col key={column} style={{ width: clientColumnWidths[column] }} />)}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
            <tr>
              <th className="border-b border-r border-slate-200 px-2 py-2 text-center">
                <input aria-label="Select all client records on this page" checked={allPageRowsSelected} className="size-3.5 cursor-pointer accent-rose-700" onChange={togglePageSelection} ref={(input) => { if (input) input.indeterminate = selectedPageCount > 0 && !allPageRowsSelected; }} type="checkbox" />
              </th>
              <th className="border-b border-r border-slate-200 px-3 py-2">Actions</th>
              {columns.map((column) => {
                const hasFilter = Boolean(valueFilters[column]);
                return (
                  <th className="border-b border-r border-slate-200 px-3 py-2" key={column}>
                    <div className="flex items-center gap-1">
                      <button className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left" onClick={() => toggleSort(column)} title={`Sort by ${column}`} type="button">
                        <span className={`min-w-0 leading-tight ${column === "S.no." ? "whitespace-nowrap" : "whitespace-normal break-words"}`}>{column}</span>
                        <span className="flex shrink-0 flex-col leading-none">
                          <ArrowUp className={`size-3 ${sortState?.column === column && sortState.direction === "asc" ? "text-navy-700" : "text-slate-300"}`} />
                          <ArrowDown className={`-mt-1 size-3 ${sortState?.column === column && sortState.direction === "desc" ? "text-navy-700" : "text-slate-300"}`} />
                        </span>
                      </button>
                      <button aria-label={`Filter ${column}`} className={`inline-flex size-5 shrink-0 items-center justify-center rounded border ${hasFilter ? "border-navy-600 bg-navy-600 text-white" : "border-slate-300 bg-white text-slate-500"}`} onClick={(event) => openColumnFilter(column, event.currentTarget)} title={`Filter ${column}`} type="button"><Filter className="size-3" /></button>
                    </div>
                    {openFilterColumn === column && filterMenuPos ? (
                      <ClientFilterMenu
                        columnLabel={column}
                        draft={filterDraft}
                        hasFilter={hasFilter}
                        menuPos={filterMenuPos}
                        onApply={() => applyColumnFilter(column)}
                        onCancel={closeColumnFilter}
                        onClear={() => clearColumnFilter(column)}
                        onSearchChange={setFilterSearch}
                        onSortAsc={() => { setSortState({ column, direction: "asc" }); closeColumnFilter(); }}
                        onSortDesc={() => { setSortState({ column, direction: "desc" }); closeColumnFilter(); }}
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
              <th className="border-b border-r border-slate-200 px-2 py-1" />
              <th className="border-b border-r border-slate-200 px-2 py-1" />
              {columns.map((column) => (
                <th className="border-b border-r border-slate-200 px-3 py-1" key={`filter-${column}`}>
                  {column === "S.no." ? null : <input aria-label={`Filter ${column}`} className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold normal-case text-slate-950 outline-none focus:border-navy-400" onChange={(event) => setColumnFilters((current) => ({ ...current, [column]: event.target.value }))} placeholder="Filter" value={columnFilters[column] ?? ""} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-8 text-sm font-bold text-slate-500" colSpan={columns.length + 2}>Loading client records...</td></tr>
            ) : pagedRows.length ? (
              pagedRows.map((row) => (
                <tr className="border-b border-slate-100 last:border-b-0" key={String(row.id)}>
                  <td className="border-r border-slate-100 px-2 py-1 text-center">
                    <input aria-label={`Select ${String(row.Particulars || "client record")}`} checked={selectedIds.has(String(row.id))} className="size-3.5 cursor-pointer accent-rose-700" onChange={() => toggleRowSelection(String(row.id))} title={selectedIds.has(String(row.id)) ? "Remove from bulk selection" : "Select for bulk delete"} type="checkbox" />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <div className="flex items-center gap-1">
                      <button className="inline-flex size-7 items-center justify-center rounded border border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => setEditor({ row: stripInternalFields(row), rowId: String(row.id) })} title="Edit client record" type="button"><Edit3 className="size-3.5" /></button>
                      <button className="inline-flex size-7 items-center justify-center rounded border border-navy-200 text-navy-700 hover:bg-navy-50" onClick={() => viewRowHistory(row)} title="View history" type="button"><History className="size-3.5" /></button>
                      <button className="inline-flex size-7 items-center justify-center rounded border border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => void deleteRow(row)} title="Delete client record" type="button"><Trash2 className="size-3.5" /></button>
                    </div>
                  </td>
                  {columns.map((column) => <td className="border-r border-slate-100 px-3 py-1 text-xs font-semibold text-slate-700" key={column}><span className="block min-h-7 py-1">{row[column] || "-"}</span></td>)}
                </tr>
              ))
            ) : (
              <tr><td className="px-4 py-8 text-sm font-bold text-slate-500" colSpan={columns.length + 2}>No client records match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isTrashOpen ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-black text-slate-950">Trash</h3>
          <div className="mt-3 overflow-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
                <tr>
                  {["Deleted", "Expires", "Group", "Particulars", "POC", "Restore"].map((heading) => (
                    <th className="border-r border-white/15 px-3 py-3" key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trashRows.map((row) => (
                  <tr className="border-b border-slate-100" key={String(row.id)}>
                    <td className="px-3 py-2 font-semibold">{formatDate(row.deleted_at)}</td>
                    <td className="px-3 py-2 font-semibold">{formatDate(row.expires_at)}</td>
                    <td className="px-3 py-2 font-semibold">{row.Group || "-"}</td>
                    <td className="px-3 py-2 font-semibold">{row.Particulars || "-"}</td>
                    <td className="px-3 py-2 font-semibold">{row["POC Name"] || "-"}</td>
                    <td className="px-3 py-2">
                      <button className={`${buttonClass} h-9 px-3`} onClick={() => restoreRow(row)} type="button">
                        <RotateCcw className="size-3.5" />
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
                {!trashRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center font-bold text-slate-500" colSpan={6}>Trash is empty.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {isAuditOpen ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-black text-slate-950">Audit Log</h3>
          <div className="mt-3 overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
                <tr>
                  {["Time", "Action", "Old Value", "New Value", "User"].map((heading) => (
                    <th className="border-r border-white/15 px-3 py-3" key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr className="border-b border-slate-100" key={log.id}>
                    <td className="px-3 py-2 font-semibold">{formatDate(log.created_at)}</td>
                    <td className="px-3 py-2 font-black">{log.action}</td>
                    <td className="max-w-xs px-3 py-2 font-semibold"><span className="block truncate">{formatAuditValue(log.old_value)}</span></td>
                    <td className="max-w-xs px-3 py-2 font-semibold"><span className="block truncate">{formatAuditValue(log.new_value)}</span></td>
                    <td className="px-3 py-2 font-semibold">{log.actor_user_id?.slice(0, 8) ?? "-"}</td>
                  </tr>
                ))}
                {!auditLogs.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center font-bold text-slate-500" colSpan={5}>No audit entries found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {editor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-700/45 p-4">
          <form className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[28px] bg-white p-5 shadow-2xl" onSubmit={saveEditor}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <h3 className="text-xl font-black text-slate-950">{editor.rowId ? "Edit Client Record" : "Add Client Record"}</h3>
              <button className={`${buttonClass} h-9 px-3`} onClick={() => setEditor(null)} type="button">
                <X className="size-4" />
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {columns.filter((column) => column !== "S.no.").map((column) => (
                <label className="block" key={column}>
                  <span className="text-xs font-black uppercase text-slate-500">{column}</span>
                  {column === "Client Type" ? (
                    <select
                      className="input mt-2"
                      onChange={(event) =>
                        setEditor((current) =>
                          current ? { ...current, row: { ...current.row, [column]: event.target.value } } : current
                        )
                      }
                      value={String(editor.row[column] ?? "")}
                    >
                      <option value="">Select</option>
                      <option value="One-Time">One-Time</option>
                      <option value="Retainer">Retainer</option>
                    </select>
                  ) : (
                    <input
                      className="input mt-2"
                      onChange={(event) =>
                        setEditor((current) =>
                          current ? { ...current, row: { ...current.row, [column]: event.target.value } } : current
                        )
                      }
                      value={String(editor.row[column] ?? "")}
                    />
                  )}
                </label>
              ))}
            </div>
            <button className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-navy-700 px-5 text-sm font-black text-white" type="submit">
              Save Client Record
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function ClientMenuItem({ icon: Icon, label, onClick }: { icon: ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
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

function ClientFilterMenu({
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
  if (typeof document === "undefined") return null;
  const allVisibleSelected = visibleOptions.length > 0 && visibleOptions.every((value) => draft.includes(value));
  const someVisibleSelected = visibleOptions.some((value) => draft.includes(value)) && !allVisibleSelected;

  return createPortal(
    <div className="fixed z-[1000] flex w-72 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-2 text-left text-slate-900 shadow-2xl" data-client-filter-menu="true" style={{ left: menuPos.left, maxHeight: menuPos.maxHeight, top: menuPos.top }}>
      <div className="shrink-0 space-y-1 border-b border-slate-200 pb-2">
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold hover:bg-slate-100" onClick={onSortAsc} type="button"><span className="w-8 text-xs font-black text-navy-700">A-Z</span>Sort A to Z</button>
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold hover:bg-slate-100" onClick={onSortDesc} type="button"><span className="w-8 text-xs font-black text-navy-700">Z-A</span>Sort Z to A</button>
      </div>
      <button className="mt-2 flex w-full shrink-0 items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:text-slate-300" disabled={!hasFilter} onClick={onClear} type="button"><X className="size-4" />Clear Filter From &quot;{columnLabel}&quot;</button>
      <div className="mt-2 flex shrink-0 justify-end gap-2">
        <button className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold" onClick={onCancel} type="button">Cancel</button>
        <button className="inline-flex h-9 items-center rounded-md bg-navy-700 px-4 text-sm font-semibold text-white" onClick={onApply} type="button">OK</button>
      </div>
      <div className="mt-2 flex shrink-0 items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5">
        <Search className="size-4 text-slate-400" />
        <input className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" onChange={(event) => onSearchChange(event.target.value)} placeholder="Search" value={search} />
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto border border-slate-200 bg-slate-50 p-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-950">
          <input checked={allVisibleSelected} className="size-4 accent-navy-700" onChange={onToggleAll} ref={(input) => { if (input) input.indeterminate = someVisibleSelected; }} type="checkbox" />
          (Select All)
        </label>
        <div className="mt-1 space-y-1">
          {visibleOptions.length ? visibleOptions.map((value) => (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-950" key={value || "(blank)"}>
              <input checked={draft.includes(value)} className="size-4 accent-navy-700" onChange={() => onToggleValue(value)} type="checkbox" />
              <span className="min-w-0 truncate" title={value || "(Blank)"}>{value || "(Blank)"}</span>
            </label>
          )) : <p className="py-6 text-center text-sm font-semibold text-slate-500">No values found</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

function createBlankRow() {
  return [importActionColumn, ...columns].reduce<RegisterRow>((row, column) => {
    if (column === importActionColumn) {
      row[column] = "Add";
      return row;
    }

    row[column] = "";
    return row;
  }, {});
}

function stripInternalFields(row: RegisterRow) {
  return columns.reduce<RegisterRow>((record, column) => {
    record[column] = row[column] ?? "";
    return record;
  }, {});
}

function withSerial(rows: RegisterRow[]): RegisterRow[] {
  return rows.map<RegisterRow>((row, index) => ({
    ...row,
    "S.no.": index + 1
  }));
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

function formatAuditValue(value: unknown) {
  if (!value) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeHeader(value: string) {
  return value.replace(/[^0-9a-z]/gi, "").toLowerCase();
}

function findMatchingClientRow(existingRows: RegisterRow[], incomingRow: RegisterRow) {
  const incomingGstin = normalizeClientLookup(incomingRow["GSTIN/UIN"]);
  const incomingPan = normalizeClientLookup(incomingRow["PAN/IT No."]);
  const incomingName = normalizeClientLookup(incomingRow.Particulars);

  return existingRows.find((row) =>
    (incomingGstin && normalizeClientLookup(row["GSTIN/UIN"]) === incomingGstin) ||
    (incomingPan && normalizeClientLookup(row["PAN/IT No."]) === incomingPan) ||
    (incomingName && normalizeClientLookup(row.Particulars) === incomingName)
  );
}

function clientRowsMatch(existing: RegisterRow, incoming: RegisterRow) {
  return columns
    .filter((column) => column !== "S.no.")
    .every((column) => normalizeClientCell(existing[column]) === normalizeClientCell(incoming[column]));
}

function normalizeClientLookup(value: unknown) {
  return String(value ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();
}

function normalizeClientCell(value: unknown) {
  return String(value ?? "").trim().replace(/\r\n/g, "\n");
}

function addImportActionDropdown(worksheet: XLSX.WorkSheet, rowCount: number) {
  const worksheetWithValidation = worksheet as XLSX.WorkSheet & {
    "!dataValidation"?: Array<Record<string, unknown>>;
  };

  worksheetWithValidation["!dataValidation"] = [
    {
      allowBlank: false,
      sqref: `A2:A${Math.max(rowCount, 2)}`,
      type: "list",
      formula1: `"${importActionOptions.join(",")}"`
    }
  ];
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return new Date(String(value)).toLocaleString();
}
