"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileSpreadsheet, Filter, Search, UsersRound, X } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ViewOnlyAccessDialog } from "@/components/shared/view-only-access-dialog";
import allocationData from "@/lib/data/gstr-9-9c-allocations-25-26.json";
import { useRegisterEditAccess } from "@/lib/use-register-access";

type CellValue = string | number | boolean;
type WorkbookSheet = { columns: string[]; name: string; rows: CellValue[][] };
export type GstrWorkbookData = { sheets: WorkbookSheet[]; sourceFile: string; title: string };

type SortDirection = "asc" | "desc";
type SortState = { columnIndex: number; direction: SortDirection } | null;
type ColumnValueFilters = Record<number, string[]>;
type ColumnFilterOption = { key: string; label: string };
type FilterMenuPosition = { left: number; listMaxHeight: number; top: number };
type StoredOverride = { column?: string; row_key?: string; value?: string };
type EditingCell = { column: string; columnIndex: number; original: string; rowKey: string; value: string };

const columnFilterOptionLimit = 1000;
const rowsPerPage = 100;
const blankColumnFilterValue = "__workline_column_blank__";
const removedColumns = new Set(["Allocation for FY 2023-24", "EM Allocation", "ORMP", "Add. Remarks", "Reg taken", "Reg Surrendered"]);
const renamedColumns: Record<string, string> = {
  "Allocation for FY 2024-25": "Allocation for FY 2025-26",
  "GSTR 9": "Whether GSTR-9 applicable",
  "GSTR 9C - Whether Applicable": "Whether GSTR-9C applicable"
};
const statusOptions = ["Requirements Mailed", "Data Received", "Drafting in Progress", "Shared with client", "Filed"];

const integerFormatter = new Intl.NumberFormat("en-IN");
const decimalFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function cellText(value: CellValue | undefined) {
  if (value === "" || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? integerFormatter.format(value) : decimalFormatter.format(value);
  }
  return String(value);
}

function columnWidth(column: string) {
  const key = column.toLowerCase();
  if (key.includes("client name")) return 300;
  if (key.includes("remarks")) return 240;
  if (key.includes("fee")) return 190;
  if (key.includes("allocation")) return 190;
  if (key.includes("applicable")) return 210;
  if (key.includes("gstin")) return 180;
  if (key.includes("resource")) return 190;
  if (key.includes("target date")) return 155;
  if (key === "status") return 210;
  return 150;
}

function rawText(value: CellValue | undefined) {
  return value === undefined || value === "" ? "" : String(value);
}

function normalizeKey(value: CellValue | undefined) {
  return rawText(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function prepareFirstSheet(workbook: GstrWorkbookData): WorkbookSheet {
  const source = workbook.sheets[0];
  const sourceColumns = source?.columns ?? [];
  const gstinByClientState = new Map<string, string>();
  const gstinsByClient = new Map<string, Set<string>>();
  const allocationByClientState = new Map<string, { allocation: CellValue; team: CellValue }>(
    Object.entries(allocationData as unknown as Record<string, [string, string]>).map(([key, [allocation, team]]) => [
      key,
      { allocation, team }
    ])
  );

  const allocationSheet = workbook.sheets.find((sheet) =>
    sheet.columns.includes("Allocation for FY 2025-26") && sheet.columns.includes("Team Allocation")
  );
  if (allocationSheet) {
    const clientIndex = allocationSheet.columns.indexOf("Client Name");
    const stateIndex = allocationSheet.columns.indexOf("State");
    const allocationIndex = allocationSheet.columns.indexOf("Allocation for FY 2025-26");
    const teamIndex = allocationSheet.columns.indexOf("Team Allocation");
    for (const row of allocationSheet.rows) {
      allocationByClientState.set(`${normalizeKey(row[clientIndex])}|${normalizeKey(row[stateIndex])}`, {
        allocation: row[allocationIndex] ?? "",
        team: row[teamIndex] ?? ""
      });
    }
  }

  for (const sheet of workbook.sheets.slice(1)) {
    const clientIndex = sheet.columns.findIndex((column) => normalizeKey(column) === "clientname");
    const stateIndex = sheet.columns.findIndex((column) => normalizeKey(column) === "state");
    const gstinIndex = sheet.columns.findIndex((column) => normalizeKey(column).startsWith("gstin"));
    if (clientIndex < 0 || gstinIndex < 0) continue;
    for (const row of sheet.rows) {
      const clientKey = normalizeKey(row[clientIndex]);
      const stateKey = normalizeKey(row[stateIndex]);
      const gstin = rawText(row[gstinIndex]).trim();
      if (!clientKey || !gstin) continue;
      gstinByClientState.set(`${clientKey}|${stateKey}`, gstin);
      const values = gstinsByClient.get(clientKey) ?? new Set<string>();
      values.add(gstin);
      gstinsByClient.set(clientKey, values);
    }
  }

  const retainedIndexes = sourceColumns.map((column, index) => ({ column, index })).filter(({ column }) => !removedColumns.has(column));
  const columns = retainedIndexes.map(({ column }) => renamedColumns[column] ?? column);
  const clientPosition = Math.max(0, columns.indexOf("Client Name"));
  columns.splice(clientPosition, 0, "GSTIN");
  const allocationPosition = columns.indexOf("Allocation for FY 2025-26");
  columns.splice(allocationPosition >= 0 ? allocationPosition + 1 : columns.length, 0, "Team Allocation", "Resource Name", "Target Date", "Status");

  const rows = (source?.rows ?? []).map((sourceRow, rowIndex) => {
    const record = new Map(retainedIndexes.map(({ column, index }) => [renamedColumns[column] ?? column, sourceRow[index] ?? ""]));
    const clientKey = normalizeKey(record.get("Client Name"));
    const stateKey = normalizeKey(record.get("State"));
    const clientGstins = gstinsByClient.get(clientKey);
    const allocation = allocationByClientState.get(`${clientKey}|${stateKey}`);
    record.set("GSTIN", gstinByClientState.get(`${clientKey}|${stateKey}`) ?? (clientGstins?.size === 1 ? Array.from(clientGstins)[0] : ""));
    record.set("Allocation for FY 2025-26", allocation?.allocation ?? "");
    record.set("Team Allocation", allocation?.team ?? "");
    record.set("Resource Name", "");
    record.set("Target Date", "");
    record.set("Status", "");
    return [...columns.map((column) => record.get(column) ?? ""), `row-${rowIndex}`];
  });

  return { columns, name: source?.name ?? "GSTR - 9 9C", rows };
}

function getFilterValueKey(value: CellValue | undefined) {
  const text = cellText(value).trim();
  return text ? text : blankColumnFilterValue;
}

function getFilterValueLabel(valueKey: string) {
  return valueKey === blankColumnFilterValue ? "(Blank)" : valueKey;
}

function getUniqueColumnFilterOptions(rows: CellValue[][], columnIndex: number, limit: number): ColumnFilterOption[] {
  const values = new Set<string>();
  for (const row of rows) {
    values.add(getFilterValueKey(row[columnIndex]));
    if (values.size >= limit) break;
  }
  return Array.from(values)
    .sort((left, right) =>
      getFilterValueLabel(left).localeCompare(getFilterValueLabel(right), undefined, { numeric: true, sensitivity: "base" })
    )
    .map((value) => ({ key: value, label: getFilterValueLabel(value) }));
}

function compareCells(left: CellValue | undefined, right: CellValue | undefined, direction: SortDirection) {
  const leftBlank = left === "" || left === undefined;
  const rightBlank = right === "" || right === undefined;
  if (leftBlank && rightBlank) return 0;
  if (leftBlank) return 1;
  if (rightBlank) return -1;
  let result: number;
  if (typeof left === "number" && typeof right === "number") {
    result = left - right;
  } else {
    result = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  }
  return direction === "asc" ? result : -result;
}

export function GstrNineNineCRegister({ workbook }: { workbook: GstrWorkbookData }) {
  const preparedSheet = useMemo(() => prepareFirstSheet(workbook), [workbook]);
  const [sourceRows, setSourceRows] = useState<CellValue[][]>(preparedSheet.rows);
  const { canEditRegisterRef } = useRegisterEditAccess();
  const [search, setSearch] = useState("");
  const [columnValueFilters, setColumnValueFilters] = useState<ColumnValueFilters>({});
  const [sortState, setSortState] = useState<SortState>(null);
  const [openFilterColumnIndex, setOpenFilterColumnIndex] = useState<number | null>(null);
  const [filterMenuPosition, setFilterMenuPosition] = useState<FilterMenuPosition | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [draftFilterValues, setDraftFilterValues] = useState<string[]>([]);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [message, setMessage] = useState("");
  const [isViewOnlyDialogOpen, setIsViewOnlyDialogOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  const activeSheet = useMemo(() => ({ ...preparedSheet, rows: sourceRows }), [preparedSheet, sourceRows]);
  const deferredSearch = useDeferredValue(search);
  const deferredColumnValueFilters = useDeferredValue(columnValueFilters);
  const query = deferredSearch.trim().toLowerCase();

  const activeFilterEntries = useMemo(
    () =>
      Object.entries(deferredColumnValueFilters)
        .map(([columnIndex, selectedValues]) => ({ columnIndex: Number(columnIndex), selectedValues }))
        .filter((entry) => entry.selectedValues.length > 0),
    [deferredColumnValueFilters]
  );

  const rows = useMemo(() => {
    const visibleRows = activeSheet.rows.filter((row) => {
      if (query && !activeSheet.columns.some((_, index) => cellText(row[index]).toLowerCase().includes(query))) return false;
      return activeFilterEntries.every(({ columnIndex, selectedValues }) =>
        selectedValues.includes(getFilterValueKey(row[columnIndex]))
      );
    });
    if (!sortState) return visibleRows;
    return [...visibleRows].sort((left, right) =>
      compareCells(left[sortState.columnIndex], right[sortState.columnIndex], sortState.direction)
    );
  }, [activeFilterEntries, activeSheet, query, sortState]);

  const hasActiveFilters = Boolean(query) || activeFilterEntries.length > 0 || Boolean(sortState);
  const totalWidth = activeSheet.columns.reduce((total, column) => total + columnWidth(column), 0);
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const paginatedRows = useMemo(
    () => rows.slice(currentPageIndex * rowsPerPage, (currentPageIndex + 1) * rowsPerPage),
    [currentPageIndex, rows]
  );

  useEffect(() => {
    setPageIndex(0);
  }, [query, deferredColumnValueFilters, sortState]);

  const openColumnFilterOptions = useMemo(
    () =>
      openFilterColumnIndex === null
        ? []
        : getUniqueColumnFilterOptions(activeSheet.rows, openFilterColumnIndex, columnFilterOptionLimit),
    [activeSheet, openFilterColumnIndex]
  );
  const visibleColumnFilterOptions = useMemo(() => {
    const needle = filterSearch.trim().toLowerCase();
    if (!needle) return openColumnFilterOptions;
    return openColumnFilterOptions.filter((option) => option.label.toLowerCase().includes(needle));
  }, [filterSearch, openColumnFilterOptions]);

  useEffect(() => {
    let active = true;
    void fetch("/api/gstr-9-9c", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, result: await response.json() as { error?: string; overrides?: StoredOverride[] } }))
      .then(({ ok, result }) => {
        if (!active) return;
        if (!ok) {
          setMessage(result.error ?? "Could not load saved changes.");
          return;
        }
        const overrides = new Map((result.overrides ?? []).map((item) => [`${item.row_key}|${item.column}`, item.value ?? ""]));
        setSourceRows(preparedSheet.rows.map((row) => {
          const next = [...row];
          const rowKey = String(row[preparedSheet.columns.length] ?? "");
          preparedSheet.columns.forEach((column, columnIndex) => {
            const saved = overrides.get(`${rowKey}|${column}`);
            if (saved !== undefined) next[columnIndex] = saved;
          });
          return next;
        }));
      })
      .catch(() => { if (active) setMessage("Could not load saved changes."); });
    return () => { active = false; };
  }, [preparedSheet]);

  const closeColumnFilter = useCallback(() => {
    setOpenFilterColumnIndex(null);
    setFilterMenuPosition(null);
    setFilterSearch("");
    setDraftFilterValues([]);
  }, []);

  useEffect(() => {
    if (openFilterColumnIndex === null) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeColumnFilter();
    }
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-gstr-filter-menu]")) return;
      closeColumnFilter();
    }
    function closeOnViewportChange(event: Event) {
      if (event.target instanceof Element && event.target.closest("[data-gstr-filter-menu]")) return;
      closeColumnFilter();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [closeColumnFilter, openFilterColumnIndex]);

  function openColumnFilter(columnIndex: number, clickPoint: { clientX: number; clientY: number }) {
    const options = getUniqueColumnFilterOptions(activeSheet.rows, columnIndex, columnFilterOptionLimit);
    const appliedValues = columnValueFilters[columnIndex];
    const menuWidth = 288;
    const viewportPadding = 12;
    const menuChromeHeight = 196;
    const minListHeight = 110;
    const preferredListHeight = 210;
    const spaceBelow = window.innerHeight - clickPoint.clientY - viewportPadding - 14;
    const spaceAbove = clickPoint.clientY - viewportPadding - 14;
    const shouldOpenBelow = spaceBelow >= menuChromeHeight + minListHeight || spaceBelow >= spaceAbove;
    const availableHeight = shouldOpenBelow ? spaceBelow : spaceAbove;
    const listMaxHeight = Math.max(minListHeight, Math.min(preferredListHeight, availableHeight - menuChromeHeight));
    const top = shouldOpenBelow
      ? clickPoint.clientY + 14
      : Math.max(viewportPadding, clickPoint.clientY - menuChromeHeight - listMaxHeight - 14);
    const left = Math.min(
      Math.max(viewportPadding, clickPoint.clientX - menuWidth / 2),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
    );

    setOpenFilterColumnIndex(columnIndex);
    setFilterMenuPosition({ left, listMaxHeight, top });
    setFilterSearch("");
    setDraftFilterValues(appliedValues?.length ? appliedValues : options.map((option) => option.key));
  }

  function toggleDraftFilterValue(value: string) {
    setDraftFilterValues((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  function toggleVisibleDraftFilterValues() {
    const visibleValues = visibleColumnFilterOptions.map((option) => option.key);
    const selectedVisible = visibleValues.filter((value) => draftFilterValues.includes(value));
    setDraftFilterValues((current) => {
      if (selectedVisible.length === visibleValues.length) {
        return current.filter((value) => !visibleValues.includes(value));
      }
      return Array.from(new Set([...current, ...visibleValues]));
    });
  }

  function applyColumnFilter(columnIndex: number) {
    const allValues = openColumnFilterOptions.map((option) => option.key);
    const selectedValues = allValues.filter((value) => draftFilterValues.includes(value));
    setColumnValueFilters((current) => {
      const next = { ...current };
      if (!selectedValues.length || selectedValues.length === allValues.length) {
        delete next[columnIndex];
      } else {
        next[columnIndex] = selectedValues;
      }
      return next;
    });
    closeColumnFilter();
  }

  function clearColumnFilter(columnIndex: number) {
    setColumnValueFilters((current) => {
      const next = { ...current };
      delete next[columnIndex];
      return next;
    });
    closeColumnFilter();
  }

  function toggleSort(columnIndex: number) {
    setSortState((current) => {
      if (!current || current.columnIndex !== columnIndex) return { columnIndex, direction: "asc" };
      if (current.direction === "asc") return { columnIndex, direction: "desc" };
      return null;
    });
  }

  function resetAll() {
    setSearch("");
    setColumnValueFilters({});
    setSortState(null);
    closeColumnFilter();
  }

  const columnCount = activeSheet.columns.length;

  const beginEdit = useCallback((row: CellValue[], column: string, columnIndex: number) => {
    if (!canEditRegisterRef.current) {
      setIsViewOnlyDialogOpen(true);
      return;
    }
    const value = rawText(row[columnIndex]);
    setEditing({ column, columnIndex, original: value, rowKey: String(row[columnCount]), value });
    setMessage("");
  }, [canEditRegisterRef, columnCount]);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const saveCell = useCallback(async (edit: EditingCell) => {
    setEditing(null);
    if (edit.value === edit.original) return;
    setSourceRows((current) => current.map((row) => String(row[columnCount]) === edit.rowKey ? row.map((value, index) => index === edit.columnIndex ? edit.value : value) : row));
    setMessage("Saving...");
    try {
      const response = await fetch("/api/gstr-9-9c", {
        body: JSON.stringify({ column: edit.column, rowKey: edit.rowKey, value: edit.value }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save this cell.");
      setMessage("Saved.");
    } catch (error) {
      setSourceRows((current) => current.map((row) => String(row[columnCount]) === edit.rowKey ? row.map((value, index) => index === edit.columnIndex ? edit.original : value) : row));
      setMessage(error instanceof Error ? error.message : "Could not save this cell.");
    }
  }, [columnCount]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-navy-700">
            <FileSpreadsheet className="size-4" />
            FY 2025-26 allocation
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">GSTR - 9 9C</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Double-click any field to edit it. Changes are saved automatically.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700">
            <UsersRound className="size-4 text-navy-700" />
            {hasActiveFilters
              ? `${rows.length.toLocaleString("en-IN")} / ${activeSheet.rows.length.toLocaleString("en-IN")} rows`
              : `${rows.length.toLocaleString("en-IN")} rows`}
          </span>
          {hasActiveFilters ? (
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              onClick={resetAll}
              type="button"
            >
              <X className="size-4" />
              Clear filters
            </button>
          ) : null}
          <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-navy-400 focus-within:ring-2 focus-within:ring-navy-100">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this sheet"
              value={search}
            />
          </label>
        </div>
      </header>
      {message ? <p className="mt-2 text-xs font-bold text-slate-600">{message}</p> : null}

      <div className="mt-3 max-h-[calc(100vh-170px)] overflow-auto rounded-lg border border-slate-200">
        <table className="table-fixed border-separate border-spacing-0 text-left text-xs" style={{ minWidth: Math.max(900, totalWidth), width: Math.max(900, totalWidth) }}>
          <colgroup>
            {activeSheet.columns.map((column) => <col key={column} style={{ width: columnWidth(column) }} />)}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-slate-100 text-slate-600">
            <tr>
              {activeSheet.columns.map((column, columnIndex) => (
                <th
                  className={`border-b border-r border-slate-200 px-3 py-2 font-black uppercase tracking-wide ${columnIndex === 0 ? "sticky left-0 z-30 bg-slate-100" : ""}`}
                  key={column}
                >
                  <ColumnHeader
                    column={column}
                    columnIndex={columnIndex}
                    draftFilterValues={draftFilterValues}
                    filterSearch={filterSearch}
                    hasFilter={Boolean(columnValueFilters[columnIndex]?.length)}
                    isOpen={openFilterColumnIndex === columnIndex}
                    menuPosition={filterMenuPosition}
                    onApplyFilter={applyColumnFilter}
                    onClearFilter={clearColumnFilter}
                    onCloseFilter={closeColumnFilter}
                    onFilterSearchChange={setFilterSearch}
                    onOpenFilter={openColumnFilter}
                    onSetSort={(index, direction) => setSortState({ columnIndex: index, direction })}
                    onSort={toggleSort}
                    onToggleDraftFilterValue={toggleDraftFilterValue}
                    onToggleVisibleDraftFilterValues={toggleVisibleDraftFilterValues}
                    optionCount={openFilterColumnIndex === columnIndex ? openColumnFilterOptions.length : 0}
                    sortState={sortState}
                    visibleOptions={openFilterColumnIndex === columnIndex ? visibleColumnFilterOptions : []}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row) => {
              const rowKey = String(row[columnCount]);
              return (
                <RegisterRow
                  activeEdit={editing?.rowKey === rowKey ? editing : null}
                  columns={activeSheet.columns}
                  key={rowKey}
                  onBeginEdit={beginEdit}
                  onCancelEdit={cancelEdit}
                  onSaveCell={saveCell}
                  row={row}
                />
              );
            })}
            {!rows.length ? (
              <tr><td className="px-4 py-10 text-center text-sm font-bold text-slate-500" colSpan={activeSheet.columns.length}>No matching rows.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
          <span>
            Showing {(currentPageIndex * rowsPerPage + 1).toLocaleString("en-IN")}–{Math.min((currentPageIndex + 1) * rowsPerPage, rows.length).toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")}
          </span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous page"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPageIndex === 0}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              type="button"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span>Page {currentPageIndex + 1} of {pageCount}</span>
            <button
              aria-label="Next page"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPageIndex >= pageCount - 1}
              onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
              type="button"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
      <ViewOnlyAccessDialog onClose={() => setIsViewOnlyDialogOpen(false)} open={isViewOnlyDialogOpen} />
    </section>
  );
}

const RegisterRow = memo(function RegisterRow({
  activeEdit,
  columns,
  onBeginEdit,
  onCancelEdit,
  onSaveCell,
  row
}: {
  activeEdit: EditingCell | null;
  columns: string[];
  onBeginEdit: (row: CellValue[], column: string, columnIndex: number) => void;
  onCancelEdit: () => void;
  onSaveCell: (edit: EditingCell) => void;
  row: CellValue[];
}) {
  return (
    <tr className="odd:bg-white even:bg-slate-50/70">
      {columns.map((column, columnIndex) => {
        const value = cellText(row[columnIndex]);
        const isEditing = activeEdit?.columnIndex === columnIndex;
        return (
          <td
            className={`h-11 border-b border-r border-slate-100 px-2 py-1.5 font-semibold text-slate-700 ${columnIndex === 0 ? "sticky left-0 z-10 bg-inherit font-bold text-slate-900" : ""}`}
            key={column}
            onDoubleClick={() => onBeginEdit(row, column, columnIndex)}
            title={isEditing ? undefined : `${value || "Blank"} — double-click to edit`}
          >
            {isEditing && activeEdit ? (
              <CellEditor column={column} edit={activeEdit} onCancel={onCancelEdit} onSave={onSaveCell} />
            ) : (
              <div className="truncate px-1">{value || <span className="text-slate-300">—</span>}</div>
            )}
          </td>
        );
      })}
    </tr>
  );
});

function CellEditor({
  column,
  edit,
  onCancel,
  onSave
}: {
  column: string;
  edit: EditingCell;
  onCancel: () => void;
  onSave: (edit: EditingCell) => void;
}) {
  const [value, setValue] = useState(edit.value);
  const className = "h-9 w-full rounded border border-navy-400 bg-white px-2 font-semibold text-slate-900 outline-none ring-2 ring-navy-100";

  if (column === "Status") {
    return (
      <select autoFocus className={className} onBlur={() => onSave({ ...edit, value })} onChange={(event) => onSave({ ...edit, value: event.target.value })} value={value}>
        <option value="">Select status</option>
        {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  return (
    <input
      autoFocus
      className={className}
      onBlur={() => onSave({ ...edit, value })}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") onCancel();
      }}
      type={column === "Target Date" ? "date" : "text"}
      value={value}
    />
  );
}

function ColumnHeader({
  column,
  columnIndex,
  draftFilterValues,
  filterSearch,
  hasFilter,
  isOpen,
  menuPosition,
  onApplyFilter,
  onClearFilter,
  onCloseFilter,
  onFilterSearchChange,
  onOpenFilter,
  onSetSort,
  onSort,
  onToggleDraftFilterValue,
  onToggleVisibleDraftFilterValues,
  optionCount,
  sortState,
  visibleOptions
}: {
  column: string;
  columnIndex: number;
  draftFilterValues: string[];
  filterSearch: string;
  hasFilter: boolean;
  isOpen: boolean;
  menuPosition: FilterMenuPosition | null;
  onApplyFilter: (columnIndex: number) => void;
  onClearFilter: (columnIndex: number) => void;
  onCloseFilter: () => void;
  onFilterSearchChange: (value: string) => void;
  onOpenFilter: (columnIndex: number, clickPoint: { clientX: number; clientY: number }) => void;
  onSetSort: (columnIndex: number, direction: SortDirection) => void;
  onSort: (columnIndex: number) => void;
  onToggleDraftFilterValue: (value: string) => void;
  onToggleVisibleDraftFilterValues: () => void;
  optionCount: number;
  sortState: SortState;
  visibleOptions: ColumnFilterOption[];
}) {
  const isAscending = sortState?.columnIndex === columnIndex && sortState.direction === "asc";
  const isDescending = sortState?.columnIndex === columnIndex && sortState.direction === "desc";
  const visibleValueKeys = visibleOptions.map((option) => option.key);
  const selectedVisibleCount = visibleValueKeys.filter((value) => draftFilterValues.includes(value)).length;
  const areAllVisibleValuesSelected = visibleValueKeys.length > 0 && selectedVisibleCount === visibleValueKeys.length;
  const areSomeVisibleValuesSelected = selectedVisibleCount > 0 && !areAllVisibleValuesSelected;

  return (
    <div className="flex min-w-0 items-center justify-between gap-1">
      <button
        aria-label={`Sort by ${column}`}
        className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left"
        onClick={() => onSort(columnIndex)}
        title={column}
        type="button"
      >
        <span className="min-w-0 whitespace-normal break-words leading-tight">{column}</span>
        <span className="flex shrink-0 flex-col leading-none">
          <ArrowUp className={`size-3 ${isAscending ? "text-navy-700" : "text-slate-300"}`} />
          <ArrowDown className={`-mt-1 size-3 ${isDescending ? "text-navy-700" : "text-slate-300"}`} />
        </span>
      </button>
      <button
        aria-label={`Open filter for ${column}`}
        className={`inline-flex size-5 shrink-0 items-center justify-center rounded border transition ${
          hasFilter
            ? "border-navy-700 bg-navy-700 text-white"
            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-200"
        }`}
        onClick={(event) => onOpenFilter(columnIndex, { clientX: event.clientX, clientY: event.clientY })}
        title={`Filter ${column}`}
        type="button"
      >
        <Filter className="size-3" />
      </button>

      {isOpen && menuPosition && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed z-[1000] w-72 overflow-hidden rounded-lg border border-slate-300 bg-white p-2 text-left normal-case tracking-normal text-slate-900 shadow-2xl"
          data-gstr-filter-menu="true"
          style={{ left: menuPosition.left, top: menuPosition.top }}
        >
          <div className="space-y-1 border-b border-slate-200 pb-2">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold transition hover:bg-slate-100"
              onClick={() => {
                onSetSort(columnIndex, "asc");
                onCloseFilter();
              }}
              type="button"
            >
              <span className="flex w-8 items-center justify-center text-xs font-black text-sky-700">A-Z</span>
              Sort A to Z
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold transition hover:bg-slate-100"
              onClick={() => {
                onSetSort(columnIndex, "desc");
                onCloseFilter();
              }}
              type="button"
            >
              <span className="flex w-8 items-center justify-center text-xs font-black text-sky-700">Z-A</span>
              Sort Z to A
            </button>
          </div>

          <button
            className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
            disabled={!hasFilter}
            onClick={() => onClearFilter(columnIndex)}
            type="button"
          >
            <X className="size-4" />
            Clear Filter From "{column}"
          </button>

          <div className="mt-2 flex justify-end gap-2">
            <button
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={onCloseFilter}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex h-9 items-center justify-center rounded-md bg-navy-700 px-4 text-sm font-semibold text-white transition hover:bg-navy-800"
              onClick={() => onApplyFilter(columnIndex)}
              type="button"
            >
              OK
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5">
            <Search className="size-4 text-slate-400" />
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
              onChange={(event) => onFilterSearchChange(event.target.value)}
              placeholder="Search"
              value={filterSearch}
            />
          </div>

          <div className="mt-2 overflow-y-auto overscroll-contain border border-slate-200 bg-slate-50 p-2" style={{ maxHeight: menuPosition.listMaxHeight }}>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-950">
              <input
                checked={areAllVisibleValuesSelected}
                className="size-4 accent-slate-950"
                onChange={onToggleVisibleDraftFilterValues}
                ref={(input) => {
                  if (input) input.indeterminate = areSomeVisibleValuesSelected;
                }}
                type="checkbox"
              />
              (Select All)
            </label>
            <div className="mt-1 space-y-1">
              {visibleOptions.length ? (
                visibleOptions.map((option) => (
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-950" key={option.key}>
                    <input
                      checked={draftFilterValues.includes(option.key)}
                      className="size-4 accent-slate-950"
                      onChange={() => onToggleDraftFilterValue(option.key)}
                      type="checkbox"
                    />
                    <span className="min-w-0 truncate" title={option.label}>{option.label}</span>
                  </label>
                ))
              ) : (
                <p className="py-6 text-center text-sm font-semibold text-slate-500">No values found</p>
              )}
            </div>
          </div>

          {optionCount >= columnFilterOptionLimit ? (
            <p className="mt-2 text-xs font-semibold text-amber-700">Showing first {columnFilterOptionLimit} unique values.</p>
          ) : null}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
