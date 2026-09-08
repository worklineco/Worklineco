"use client";

import { ArrowDown, ArrowUp, FileSpreadsheet, Filter, Search, UsersRound, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type CellValue = string | number | boolean;
type WorkbookSheet = { columns: string[]; name: string; rows: CellValue[][] };
export type GstrWorkbookData = { sheets: WorkbookSheet[]; sourceFile: string; title: string };

type SortDirection = "asc" | "desc";
type SortState = { columnIndex: number; direction: SortDirection } | null;
type ColumnValueFilters = Record<number, string[]>;
type ColumnFilterOption = { key: string; label: string };
type FilterMenuPosition = { left: number; listMaxHeight: number; top: number };

const columnFilterOptionLimit = 1000;
const blankColumnFilterValue = "__workline_column_blank__";

function cellText(value: CellValue | undefined) {
  if (value === "" || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
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
  return 150;
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
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [columnValueFilters, setColumnValueFilters] = useState<ColumnValueFilters>({});
  const [sortState, setSortState] = useState<SortState>(null);
  const [openFilterColumnIndex, setOpenFilterColumnIndex] = useState<number | null>(null);
  const [filterMenuPosition, setFilterMenuPosition] = useState<FilterMenuPosition | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [draftFilterValues, setDraftFilterValues] = useState<string[]>([]);

  const activeSheet = workbook.sheets[activeSheetIndex] ?? workbook.sheets[0];
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
      if (query && !row.some((value) => cellText(value).toLowerCase().includes(query))) return false;
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

  function selectSheet(index: number) {
    setActiveSheetIndex(index);
    setSearch("");
    setColumnValueFilters({});
    setSortState(null);
    closeColumnFilter();
  }

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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-navy-700">
            <FileSpreadsheet className="size-4" />
            FY 2025-26 allocation
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">GSTR - 9 9C</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Imported from {workbook.sourceFile}</p>
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

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {workbook.sheets.map((sheet, index) => (
          <button
            className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-black transition ${
              index === activeSheetIndex
                ? "border-navy-700 bg-navy-700 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            key={sheet.name}
            onClick={() => selectSheet(index)}
            type="button"
          >
            {sheet.name}
            <span className={`ml-2 ${index === activeSheetIndex ? "text-navy-100" : "text-slate-400"}`}>{sheet.rows.length}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 max-h-[calc(100vh-205px)] overflow-auto rounded-lg border border-slate-200">
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
            {rows.map((row, rowIndex) => (
              <tr className="odd:bg-white even:bg-slate-50/70" key={`${activeSheet.name}-${rowIndex}`}>
                {activeSheet.columns.map((column, columnIndex) => {
                  const value = cellText(row[columnIndex]);
                  return (
                    <td
                      className={`h-9 truncate border-b border-r border-slate-100 px-3 py-2 font-semibold text-slate-700 ${columnIndex === 0 ? "sticky left-0 z-10 bg-inherit font-bold text-slate-900" : ""}`}
                      key={`${column}-${columnIndex}`}
                      title={value}
                    >
                      {value || <span className="text-slate-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!rows.length ? (
              <tr><td className="px-4 py-10 text-center text-sm font-bold text-slate-500" colSpan={activeSheet.columns.length}>No matching rows.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
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
