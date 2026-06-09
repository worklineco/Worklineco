"use client";

import { downloadGstatPoa } from "@/lib/gstat/poa-document";
import { supabase } from "@/lib/supabase/client";
import { ArrowDown, ArrowLeft, ArrowUp, Download, Expand, ExternalLink, FileSpreadsheet, FileText, Filter, History, Pencil, Plus, Scale, Search, Settings2, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { ChangeEvent, memo, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx-js-style";

type Column = { group?: string; key: string; label: string };
type RowData = Record<string, string | number>;
type AppealRow = {
  data: RowData;
  id?: string;
  row_number: number;
  updated_at?: string;
};
type ExportRow = { displayIndex: number; row: AppealRow };
type EditorState = { draft: RowData; isNew?: boolean; row: AppealRow; rowIndex: number };
type UserAccess = { isPartner: boolean; team: string };
type CellStyle = NonNullable<XLSX.CellObject["s"]>;
type SortDirection = "asc" | "desc";
type SortState = { columnKey: string; direction: SortDirection } | null;
type ColumnValueFilters = Record<string, string[]>;
type ColumnTextFilters = Record<string, string>;
type ColumnFilterOption = { key: string; label: string };
type FilterMenuPosition = { left: number; maxHeight: number; top: number };
type InlineEditorState = { columnKey: string; rowIndex: number; value: string };
type ColumnLayout = { hiddenColumnKeys: string[]; order: string[] };

const actionColumnWidth = 122;
const columnFilterOptionLimit = 1000;
const blankColumnFilterValue = "__workline_column_blank__";
const maxBulkDeleteRows = 5;
const columnLayoutStorageKey = "workline:gstat-column-layout:v1";
const poaGptUrl = "https://chatgpt.com/g/g-6a1f3abf8d008191985119e155f67c5f-poa-vakalatnama-helper";

const baseColumns: Column[] = [
  "Sno",
  "Person handling",
  "Status",
  "Proceedings Status",
  "Next Hearing Date",
  "Entity Group",
  "Entity Name",
  "State Name",
  "Due Date",
  "FY",
  "State/Centre",
  "OIO No",
  "OIO Date",
  "DRC 07 No",
  "DRC 07 Date",
  "OIA No",
  "OIA Date",
  "APL 04 No",
  "APL 04 Date",
  "Favourable/Against",
  "Additional 10% compliances",
  "Pre Deposit/Court Fees Mail",
  "Undertaking Requirement",
  "Matter pending at high court",
  "Issue in brief",
  "Determined Tax Amount",
  "Determined Interest Amount",
  "Determined Penalty Amount",
  "Refund / Fees",
  "Section No.",
  "Document Link",
  "Remark",
  "ARN of First Appeal",
  "EL status",
  "GSTAT Login ID",
  "GSTAT Login Password",
  "Appellant"
].map((label) => ({ key: label, label }));

const groupedColumns = [
  { columns: ["IGST", "CGST", "SGST"], label: "Tax Demand" },
  { columns: ["IGST", "CGST", "SGST"], label: "Penalty Demand" },
  { columns: ["IGST", "CGST", "SGST"], label: "Pre Deposit Amount" }
];

const demandColumns: Column[] = groupedColumns.flatMap((group) =>
  group.columns.map((label) => ({
    group: group.label,
    key: `${group.label} - ${label}`,
    label
  }))
);
const columns = [...baseColumns, ...demandColumns];
const defaultColumnOrder = columns.map((column) => column.key);
const columnByKey = new Map(columns.map((column) => [column.key, column]));
const defaultColumnWidth = 92;
const columnWidths: Record<string, number> = {
  "Sno": 52,
  "Person handling": 92,
  "Status": 96,
  "Proceedings Status": 132,
  "Next Hearing Date": 116,
  "Entity Group": 142,
  "Entity Name": 214,
  "State Name": 108,
  "Due Date": 112,
  "FY": 96,
  "State/Centre": 106,
  "OIO No": 190,
  "OIO Date": 98,
  "DRC 07 No": 176,
  "DRC 07 Date": 106,
  "OIA No": 184,
  "OIA Date": 98,
  "APL 04 No": 156,
  "APL 04 Date": 106,
  "Favourable/Against": 126,
  "Additional 10% compliances": 142,
  "Pre Deposit/Court Fees Mail": 156,
  "Undertaking Requirement": 142,
  "Matter pending at high court": 146,
  "Issue in brief": 218,
  "Determined Tax Amount": 128,
  "Determined Interest Amount": 138,
  "Determined Penalty Amount": 138,
  "Refund / Fees": 116,
  "Section No.": 112,
  "Document Link": 132,
  "Remark": 174,
  "ARN of First Appeal": 160,
  "EL status": 92,
  "GSTAT Login ID": 132,
  "GSTAT Login Password": 142,
  "Appellant": 150
};
const tableWidth = actionColumnWidth + columns.reduce((total, column) => total + getColumnWidth(column), 0);
const requiredBlankCheckColumns = baseColumns.filter(
  (column) =>
    column.key !== "Sno" &&
    baseColumns.findIndex((item) => item.key === column.key) <=
      baseColumns.findIndex((item) => item.key === "GSTAT Login Password")
);
const teamOptions = [
  "Team 01",
  "Team 03",
  "Team 04",
  "Team 05",
  "Team 06",
  "Team 07",
  "Team 08",
  "Team 09",
  "Team 10",
  "Team 12"
];
const editorSections = [
  {
    fields: [
      "Sno",
      "Person handling",
      "Status",
      "Proceedings Status",
      "Next Hearing Date",
      "Entity Group",
      "Entity Name",
      "State Name",
      "Due Date",
      "FY",
      "State/Centre",
      "Appellant"
    ],
    title: "Basic details"
  },
  {
    fields: [
      "OIO No",
      "OIO Date",
      "DRC 07 No",
      "DRC 07 Date",
      "OIA No",
      "OIA Date",
      "APL 04 No",
      "APL 04 Date",
      "ARN of First Appeal",
      "EL status"
    ],
    title: "Order and appeal"
  },
  {
    fields: [
      "Favourable/Against",
      "Additional 10% compliances",
      "Pre Deposit/Court Fees Mail",
      "Undertaking Requirement",
      "Matter pending at high court",
      "Issue in brief",
      "Section No.",
      "Document Link",
      "Remark"
    ],
    title: "Compliance and notes"
  },
  {
    fields: [
      "Determined Tax Amount",
      "Determined Interest Amount",
      "Determined Penalty Amount",
      "Refund / Fees"
    ],
    title: "Demand and deposit"
  },
  {
    fields: ["GSTAT Login ID", "GSTAT Login Password"],
    title: "GSTAT login"
  }
];
const demandEditorGroups = [
  { fields: ["Tax Demand - CGST", "Tax Demand - SGST", "Tax Demand - IGST"], title: "Tax Demand" },
  { fields: ["Penalty Demand - CGST", "Penalty Demand - SGST", "Penalty Demand - IGST"], title: "Penalty Demand" },
  { fields: ["Pre Deposit Amount - CGST", "Pre Deposit Amount - SGST", "Pre Deposit Amount - IGST"], title: "Pre Deposit Amount" }
];
const dateFields = new Set(["Next Hearing Date", "Due Date"]);

const initialRows = createEmptyRows(12);

export function GstatRegister({ isMaximized = false }: { isMaximized?: boolean }) {
  const [rows, setRows] = useState<AppealRow[]>(initialRows);
  const [columnValueFilters, setColumnValueFilters] = useState<ColumnValueFilters>({});
  const [columnTextFilters, setColumnTextFilters] = useState<ColumnTextFilters>({});
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnOrder);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(() => new Set());
  const [hasLoadedColumnLayout, setHasLoadedColumnLayout] = useState(false);
  const [isColumnOptionsOpen, setIsColumnOptionsOpen] = useState(false);
  const [openFilterColumnKey, setOpenFilterColumnKey] = useState<string | null>(null);
  const [filterMenuPosition, setFilterMenuPosition] = useState<FilterMenuPosition | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [draftFilterValues, setDraftFilterValues] = useState<string[]>([]);
  const [inlineEditor, setInlineEditor] = useState<InlineEditorState | null>(null);
  const [savingInlineCell, setSavingInlineCell] = useState<{ columnKey: string; rowIndex: number } | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingEditor, setIsSavingEditor] = useState(false);
  const [message, setMessage] = useState("");
  const [userAccess, setUserAccess] = useState<UserAccess>({ isPartner: false, team: "" });
  const [sortState, setSortState] = useState<SortState>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [, startRowsTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inlineSaveCancelledRef = useRef(false);
  const inlineSaveInFlightRef = useRef(false);
  const uniqueAppeals = useMemo(
    () => new Set(rows.map((row) => String(row.data["OIA No"] ?? "").trim()).filter(Boolean)).size,
    [rows]
  );
  const duplicateDrc07Numbers = useMemo(() => findDuplicateValues(rows, "DRC 07 No"), [rows]);
  const duplicateOiaNumbers = useMemo(() => findDuplicateValues(rows, "OIA No"), [rows]);
  const blankRequiredCellCount = useMemo(
    () =>
      rows.reduce(
        (count, row) =>
          count + requiredBlankCheckColumns.filter((column) => isBlankCell(row.data[column.key])).length,
        0
      ),
    [rows]
  );
  const orderedColumns = useMemo(
    () =>
      columnOrder
        .map((columnKey) => columnByKey.get(columnKey))
        .filter((column): column is Column => Boolean(column)),
    [columnOrder]
  );
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !hiddenColumnKeys.has(column.key)),
    [hiddenColumnKeys, orderedColumns]
  );
  const visibleTableWidth = useMemo(
    () => actionColumnWidth + visibleColumns.reduce((total, column) => total + getColumnWidth(column), 0),
    [visibleColumns]
  );
  
  const [globalSearch, setGlobalSearch] = useState("");
  const deferredColumnValueFilters = useDeferredValue(columnValueFilters);
  const deferredColumnTextFilters = useDeferredValue(columnTextFilters);
  const deferredGlobalSearch = useDeferredValue(globalSearch);
  const activeColumnFilterEntries = useMemo(
    () =>
      Object.entries(deferredColumnValueFilters)
        .map(([columnKey, selectedValues]) => ({ column: columnByKey.get(columnKey), selectedValues }))
        .filter(
          (entry): entry is { column: Column; selectedValues: string[] } =>
            Boolean(entry.column) && entry.selectedValues.length > 0
        ),
    [deferredColumnValueFilters]
  );
  const activeColumnTextFilterEntries = useMemo(
    () =>
      Object.entries(deferredColumnTextFilters)
        .map(([columnKey, filter]) => ({ column: columnByKey.get(columnKey), filter }))
        .filter(
          (entry): entry is { column: Column; filter: string } =>
            Boolean(entry.column) && Boolean(entry.filter.trim())
        ),
    [deferredColumnTextFilters]
  );
  const rowSearchText = useMemo(
    () =>
      rows.map((row) =>
        columns
          .map((column) => String(row.data[column.key] ?? ""))
          .join(" ")
          .toLowerCase()
      ),
    [rows]
  );

  const filteredRows = useMemo(
    () => {
      const globalSearchLower = deferredGlobalSearch.toLowerCase().trim();
      const visibleRows = rows
        .map((row, index) => ({ row, originalIndex: index }))
        .filter(({ row, originalIndex }) => {
          if (globalSearchLower) {
            const matchesGroupedOiaSearch =
              isGroupedOiaSearch(globalSearchLower) &&
              duplicateOiaNumbers.has(normalizeDuplicateValue(row.data["OIA No"]));
            const matchesGlobal =
              matchesGroupedOiaSearch ||
              rowSearchText[originalIndex]?.includes(globalSearchLower);
            if (!matchesGlobal) return false;
          }

          return activeColumnFilterEntries.every(({ column, selectedValues }) =>
            selectedValues.includes(getColumnFilterValueKey(row.data[column.key], column))
          ) && activeColumnTextFilterEntries.every(({ column, filter }) =>
            matchesColumnFilter(row.data[column.key], column, filter, { duplicateOiaNumbers })
          );
        });

      if (!sortState) {
        return visibleRows;
      }

      const sortColumn = columnByKey.get(sortState.columnKey);

      if (!sortColumn) {
        return visibleRows;
      }

      return [...visibleRows].sort((left, right) => compareRowsForColumn(left, right, sortColumn, sortState.direction));
    },
    [activeColumnFilterEntries, activeColumnTextFilterEntries, deferredGlobalSearch, duplicateOiaNumbers, rows, rowSearchText, sortState]
  );
  
  const filteredUniqueAppeals = useMemo(
    () => new Set(filteredRows.map(({ row }) => String(row.data["OIA No"] ?? "").trim()).filter(Boolean)).size,
    [filteredRows]
  );
  
  const hasActiveFilters = useMemo(
    () =>
      Boolean(globalSearch.trim()) ||
      Object.values(columnValueFilters).some((selectedValues) => selectedValues.length) ||
      Object.values(columnTextFilters).some((filter) => filter.trim()),
    [columnTextFilters, columnValueFilters, globalSearch]
  );
  const selectedRowIndexes = useMemo(
    () =>
      rows
        .map((row, index) => ({ index, key: getRowSelectionKey(row, index) }))
        .filter(({ key }) => selectedRowKeys.has(key))
        .map(({ index }) => index),
    [rows, selectedRowKeys]
  );
  const selectedPoaRow = selectedRowIndexes.length === 1 ? rows[selectedRowIndexes[0]] : null;
  const visibleRowKeys = useMemo(
    () => filteredRows.map(({ row, originalIndex }) => getRowSelectionKey(row, originalIndex)),
    [filteredRows]
  );
  const selectedVisibleRowCount = visibleRowKeys.filter((key) => selectedRowKeys.has(key)).length;
  const areAllVisibleRowsSelected = visibleRowKeys.length > 0 && selectedVisibleRowCount === visibleRowKeys.length;
  const areSomeVisibleRowsSelected = selectedVisibleRowCount > 0 && !areAllVisibleRowsSelected;
  const openFilterColumn = openFilterColumnKey ? columnByKey.get(openFilterColumnKey) ?? null : null;
  const openColumnFilterOptions = useMemo(
    () =>
      openFilterColumn
        ? getUniqueColumnFilterOptions(rows, openFilterColumn, columnFilterOptionLimit)
        : [],
    [openFilterColumn, rows]
  );
  const visibleColumnFilterOptions = useMemo(() => {
    const search = filterSearch.trim().toLowerCase();

    if (!search) {
      return openColumnFilterOptions;
    }

    return openColumnFilterOptions.filter((option) => option.label.toLowerCase().includes(search));
  }, [filterSearch, openColumnFilterOptions]);

  function toggleSort(column: Column) {
    setSortState((currentSort) => {
      if (currentSort?.columnKey !== column.key) {
        return { columnKey: column.key, direction: "asc" };
      }

      if (currentSort.direction === "asc") {
        return { columnKey: column.key, direction: "desc" };
      }

      return null;
    });
  }

  function toggleRowSelection(row: AppealRow, rowIndex: number) {
    const rowKey = getRowSelectionKey(row, rowIndex);

    setSelectedRowKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (nextKeys.has(rowKey)) {
        nextKeys.delete(rowKey);
      } else {
        nextKeys.add(rowKey);
      }

      return nextKeys;
    });
  }

  function toggleVisibleRowSelection() {
    setSelectedRowKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (areAllVisibleRowsSelected) {
        visibleRowKeys.forEach((key) => nextKeys.delete(key));
      } else {
        visibleRowKeys.forEach((key) => nextKeys.add(key));
      }

      return nextKeys;
    });
  }

  function openColumnFilter(column: Column, anchor: HTMLElement) {
    const options = getUniqueColumnFilterOptions(rows, column, columnFilterOptionLimit);
    const appliedValues = columnValueFilters[column.key];
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 288;
    const viewportPadding = 12;
    const top = Math.min(rect.bottom + 8, window.innerHeight - 120);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
    );

    setOpenFilterColumnKey(column.key);
    setFilterMenuPosition({
      left,
      maxHeight: Math.max(260, window.innerHeight - top - viewportPadding),
      top
    });
    setFilterSearch("");
    setDraftFilterValues(appliedValues?.length ? appliedValues : options.map((option) => option.key));
  }

  function closeColumnFilter() {
    setOpenFilterColumnKey(null);
    setFilterMenuPosition(null);
    setFilterSearch("");
    setDraftFilterValues([]);
  }

  function toggleDraftFilterValue(value: string) {
    setDraftFilterValues((currentValues) =>
      currentValues.includes(value)
        ? currentValues.filter((currentValue) => currentValue !== value)
        : [...currentValues, value]
    );
  }

  function toggleVisibleDraftFilterValues() {
    const visibleValues = visibleColumnFilterOptions.map((option) => option.key);
    const selectedVisibleValues = visibleValues.filter((value) => draftFilterValues.includes(value));

    setDraftFilterValues((currentValues) => {
      if (selectedVisibleValues.length === visibleValues.length) {
        return currentValues.filter((value) => !visibleValues.includes(value));
      }

      return Array.from(new Set([...currentValues, ...visibleValues]));
    });
  }

  function setColumnSort(column: Column, direction: SortDirection) {
    setSortState({ columnKey: column.key, direction });
  }

  function applyColumnFilter(column: Column) {
    const allValues = openColumnFilterOptions.map((option) => option.key);
    const selectedValues = allValues.filter((value) => draftFilterValues.includes(value));

    setColumnValueFilters((currentFilters) => {
      const nextFilters = { ...currentFilters };

      if (!selectedValues.length || selectedValues.length === allValues.length) {
        delete nextFilters[column.key];
      } else {
        nextFilters[column.key] = selectedValues;
      }

      return nextFilters;
    });
    closeColumnFilter();
  }

  function clearColumnFilter(column: Column) {
    setColumnValueFilters((currentFilters) => {
      const nextFilters = { ...currentFilters };
      delete nextFilters[column.key];
      return nextFilters;
    });
    closeColumnFilter();
  }

  function updateColumnTextFilter(column: Column, value: string) {
    setColumnTextFilters((currentFilters) => {
      const nextFilters = { ...currentFilters };

      if (value.trim()) {
        nextFilters[column.key] = value;
      } else {
        delete nextFilters[column.key];
      }

      return nextFilters;
    });
  }

  function clearAllFilters() {
    setGlobalSearch("");
    setColumnValueFilters({});
    setColumnTextFilters({});
    closeColumnFilter();
  }

  function applyColumnLayout(layout: ColumnLayout) {
    const normalizedLayout = normalizeColumnLayout(layout);
    setColumnOrder(normalizedLayout.order);
    setHiddenColumnKeys(new Set(normalizedLayout.hiddenColumnKeys));
    setIsColumnOptionsOpen(false);
  }

  useEffect(() => {
    loadUserAccess();
    loadRows();
    const savedColumnLayout = getSavedColumnLayout();
    setColumnOrder(savedColumnLayout.order);
    setHiddenColumnKeys(new Set(savedColumnLayout.hiddenColumnKeys));
    setHasLoadedColumnLayout(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedColumnLayout) {
      return;
    }

    saveColumnLayout({
      hiddenColumnKeys: Array.from(hiddenColumnKeys),
      order: columnOrder
    });
  }, [columnOrder, hasLoadedColumnLayout, hiddenColumnKeys]);

  async function loadUserAccess() {
    const { data } = await supabase.auth.getUser();
    const metadata = data.user?.user_metadata ?? {};
    const role = String(metadata.role ?? "").trim().toLowerCase();

    setUserAccess({
      isPartner: role === "partner",
      team: String(metadata.team ?? "").trim()
    });
  }

  async function loadRows() {
    setIsLoading(true);
    const response = await fetch("/api/gstat");
    const result = (await response.json()) as { error?: string; rows?: AppealRow[] };

    if (!response.ok) {
      setMessage(result.error ?? "Could not load GSTAT data.");
      setIsLoading(false);
      return;
    }

    setRows(result.rows?.length ? normalizeRows(result.rows) : initialRows);
    setSelectedRowKeys(new Set());
    setIsLoading(false);
  }

  function exportExcel(scope: "all" | "current") {
    const exportRows =
      scope === "current"
        ? filteredRows.map(({ originalIndex, row }) => ({ displayIndex: originalIndex + 1, row }))
        : rows.map((row, index) => ({ displayIndex: index + 1, row }));
    const exportDuplicateDrc07Numbers = findDuplicateValues(
      exportRows.map(({ row }) => row),
      "DRC 07 No"
    );
    const exportDuplicateOiaNumbers = findDuplicateValues(
      exportRows.map(({ row }) => row),
      "OIA No"
    );
    const headerRowOne = [
      ...baseColumns.map((column) => column.label),
      ...groupedColumns.flatMap((group) => [group.label, "", ""])
    ];
    const headerRowTwo = [
      ...baseColumns.map(() => ""),
      ...groupedColumns.flatMap((group) => group.columns)
    ];
    const dataRows = exportRows.map(({ displayIndex, row }) =>
      columns.map((column) =>
        column.key === "Sno"
          ? row.row_number || row.data.Sno || displayIndex
          : dateFields.has(column.key)
            ? formatDateForDisplay(row.data[column.key])
            : row.data[column.key] ?? ""
      )
    );
    const worksheet = XLSX.utils.aoa_to_sheet([headerRowOne, headerRowTwo, ...dataRows]);

    worksheet["!merges"] = [
      ...baseColumns.map((_, index) => ({ e: { c: index, r: 1 }, s: { c: index, r: 0 } })),
      ...groupedColumns.map((_, index) => {
        const start = baseColumns.length + index * 3;
        return { e: { c: start + 2, r: 0 }, s: { c: start, r: 0 } };
      })
    ];
    worksheet["!cols"] = columns.map((column) => ({ wch: Math.max(14, column.label.length + 3) }));
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ e: { c: columns.length - 1, r: 1 }, s: { c: 0, r: 1 } }) };
    worksheet["!freeze"] = { xSplit: 1, ySplit: 2 };

    styleGstatWorksheet(worksheet, exportRows, exportDuplicateDrc07Numbers, exportDuplicateOiaNumbers);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "GSTAT");
    XLSX.writeFile(
      workbook,
      scope === "current" ? "workline-gstat-current-view.xlsx" : "workline-gstat-full-table.xlsx"
    );
  }

  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setMessage(`Importing ${file.name}...`);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Array<string | number>>(worksheet, {
        blankrows: false,
        defval: "",
        header: 1
      });
      const headerIndex = findHeaderRow(rawRows);
      const dataStartIndex = headerIndex + 1;
      const nextRows = rawRows
        .slice(dataStartIndex)
        .filter((rawRow) => rawRow.some((value) => String(value).trim()))
        .map((rawRow, rowIndex) => ({
          data: columns.reduce<RowData>((row, column, columnIndex) => {
            row[column.key] =
              column.key === "Sno"
                ? rowIndex + 1
                : dateFields.has(column.key)
                  ? normalizeDateValue(rawRow[columnIndex])
                  : rawRow[columnIndex] ?? "";
            return row;
          }, {}),
          row_number: rowIndex + 1
        }));

      if (!nextRows.length) {
        setMessage("No GSTAT rows found in the selected Excel file.");
        event.target.value = "";
        return;
      }

      const response = await fetch("/api/gstat", {
        body: JSON.stringify({ action: "import", rows: nextRows }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { error?: string; rows?: AppealRow[] };

      if (!response.ok) {
        setMessage(`Could not import ${nextRows.length} row${nextRows.length === 1 ? "" : "s"}: ${result.error ?? "database save failed"}`);
        event.target.value = "";
        return;
      }

      setRows(result.rows?.length ? normalizeRows(result.rows) : rows);
      setSelectedRowKeys(new Set());
      setMessage(`${nextRows.length} row${nextRows.length === 1 ? "" : "s"} added from ${file.name}. Audit log updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read the selected Excel file.");
    } finally {
      event.target.value = "";
    }
  }

  async function deleteRow(rowIndex: number) {
    const rowLabel = rows[rowIndex]?.data.Sno || rowIndex + 1;

    if (!window.confirm(`Delete row ${rowLabel}?`)) {
      return;
    }

    const nextRows = renumberRows(
      rows.length > 1 ? rows.filter((_, index) => index !== rowIndex) : [createEmptyRow(1)]
    );

    setRows(nextRows);
    setSelectedRowKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      nextKeys.delete(getRowSelectionKey(rows[rowIndex], rowIndex));
      return nextKeys;
    });
    await saveRowOperation("row_delete", rowIndex, `Deleted row ${rowLabel}. Audit log updated.`);
  }

  async function deleteSelectedRows() {
    if (!selectedRowIndexes.length) {
      return;
    }

    if (selectedRowIndexes.length > maxBulkDeleteRows) {
      setMessage(`You can delete at most ${maxBulkDeleteRows} GSTAT rows at once. Select fewer rows and try again.`);
      return;
    }

    if (
      !window.confirm(
        `Delete ${selectedRowIndexes.length} selected row${selectedRowIndexes.length === 1 ? "" : "s"}?`
      )
    ) {
      return;
    }

    const selectedIndexes = new Set(selectedRowIndexes);
    const nextRows = renumberRows(
      rows.length > selectedIndexes.size
        ? rows.filter((_, index) => !selectedIndexes.has(index))
        : [createEmptyRow(1)]
    );

    setRows(nextRows);
    setSelectedRowKeys(new Set());
    await saveBulkDeleteOperation(selectedRowIndexes, selectedRowIndexes.length);
  }

  async function saveRowOperation(action: "row_delete", rowIndex: number, successMessage: string) {
    setMessage("Deleting row...");

    const response = await fetch("/api/gstat", {
      body: JSON.stringify({ action, rowIndex }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { error?: string; rows?: AppealRow[] };

    if (!response.ok) {
      setMessage(result.error ?? "Could not save GSTAT rows.");
      await loadRows();
      return;
    }

    const savedRows = result.rows?.length ? normalizeRows(result.rows) : rows;
    setRows(savedRows);
    setSelectedRowKeys(new Set());
    setMessage(successMessage);
  }

  async function saveBulkDeleteOperation(rowIndexes: number[], deletedCount: number) {
    if (deletedCount > maxBulkDeleteRows) {
      setMessage(`You can delete at most ${maxBulkDeleteRows} GSTAT rows at once.`);
      await loadRows();
      return;
    }

    setMessage(`Deleting ${deletedCount} selected row${deletedCount === 1 ? "" : "s"}...`);

    const response = await fetch("/api/gstat", {
      body: JSON.stringify({ action: "bulk_delete", rowIndexes }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { error?: string; rows?: AppealRow[] };

    if (!response.ok) {
      setMessage(result.error ?? "Could not delete selected GSTAT rows.");
      await loadRows();
      return;
    }

    const savedRows = result.rows?.length ? normalizeRows(result.rows) : rows;
    setRows(savedRows);
    setSelectedRowKeys(new Set());
    setMessage(`Deleted ${deletedCount} selected row${deletedCount === 1 ? "" : "s"}. Audit log updated.`);
  }

  function openNewEditor() {
    const row = createEmptyRow(rows.length + 1);
    const draft = applyPersonHandlingForAccess(row.data, userAccess);

    setEditor({
      draft,
      isNew: true,
      row: { ...row, data: draft },
      rowIndex: rows.length
    });
  }

  function openEditor(rowIndex: number, row = rows[rowIndex]) {
    if (!row) {
      return;
    }

    setEditor({
      draft: applyPersonHandlingForAccess(row.data, userAccess),
      row,
      rowIndex
    });
  }

  function updateDraft(field: string, value: string) {
    if (isPersonHandlingLocked(userAccess) && field === "Person handling") {
      return;
    }

    setEditor((currentEditor) =>
      currentEditor
        ? {
            ...currentEditor,
            draft: { ...currentEditor.draft, [field]: dateFields.has(field) ? normalizeDateValue(value) : value }
          }
        : currentEditor
    );
  }

  function openInlineEditor(rowIndex: number, column: Column, value: string | number | undefined) {
    if (!canInlineEdit(column.key, userAccess)) {
      return;
    }

    inlineSaveCancelledRef.current = false;
    setInlineEditor({
      columnKey: column.key,
      rowIndex,
      value: dateFields.has(column.key) ? normalizeDateValue(value) : String(value ?? "")
    });
  }

  function cancelInlineEditor() {
    inlineSaveCancelledRef.current = true;
    setInlineEditor(null);
  }

  async function saveInlineEditor() {
    if (inlineSaveCancelledRef.current) {
      inlineSaveCancelledRef.current = false;
      return;
    }

    if (!inlineEditor || savingInlineCell || inlineSaveInFlightRef.current) {
      return;
    }

    const row = rows[inlineEditor.rowIndex];

    if (!row) {
      setInlineEditor(null);
      return;
    }

    const nextValue = dateFields.has(inlineEditor.columnKey)
      ? normalizeDateValue(inlineEditor.value)
      : inlineEditor.value;
    const currentValue = dateFields.has(inlineEditor.columnKey)
      ? normalizeDateValue(row.data[inlineEditor.columnKey])
      : String(row.data[inlineEditor.columnKey] ?? "");

    if (String(nextValue) === String(currentValue)) {
      setInlineEditor(null);
      return;
    }

    const nextData = applyPersonHandlingForAccess(
      {
        ...row.data,
        [inlineEditor.columnKey]: nextValue,
        Sno: row.row_number || inlineEditor.rowIndex + 1
      },
      userAccess
    );
    const optimisticRow = normalizeRow({ ...row, data: nextData }, inlineEditor.rowIndex);

    inlineSaveInFlightRef.current = true;
    setSavingInlineCell({ columnKey: inlineEditor.columnKey, rowIndex: inlineEditor.rowIndex });
    setInlineEditor(null);
    startRowsTransition(() => {
      setRows((currentRows) =>
        currentRows.map((currentRow, index) => (index === inlineEditor.rowIndex ? optimisticRow : currentRow))
      );
    });

    const response = await fetch("/api/gstat", {
      body: JSON.stringify({
        id: row.id,
        row,
        rowData: nextData
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    const result = (await response.json()) as { error?: string; row?: AppealRow };

    if (!response.ok || !result.row) {
      setMessage(result.error ?? "Could not save GSTAT cell.");
      inlineSaveInFlightRef.current = false;
      setSavingInlineCell(null);
      await loadRows();
      return;
    }

    startRowsTransition(() => {
      setRows((currentRows) =>
        currentRows.map((currentRow, index) =>
          index === inlineEditor.rowIndex ? normalizeRow(result.row!, inlineEditor.rowIndex) : currentRow
        )
      );
    });
    inlineSaveInFlightRef.current = false;
    setSavingInlineCell(null);
    setMessage(`Saved ${inlineEditor.columnKey} for row ${inlineEditor.rowIndex + 1}.`);
  }

  async function saveEditor() {
    if (!editor || isSavingEditor) {
      return;
    }

    const rowIndex = editor.rowIndex;
    const row = editor.isNew ? editor.row : rows[rowIndex];
    const draft = applyPersonHandlingForAccess(
      { ...editor.draft, Sno: row.row_number || rowIndex + 1 },
      userAccess
    );

    if (!row) {
      return;
    }

    const optimisticRow = normalizeRow(
      {
        ...row,
        data: draft
      },
      rowIndex
    );

    setIsSavingEditor(true);
    setEditor(null);
    setMessage(`Saving row ${rowIndex + 1}...`);
    startRowsTransition(() => {
      setRows((currentRows) => {
        if (editor.isNew) {
          return normalizeRows([...currentRows, optimisticRow]);
        }

        return currentRows.map((currentRow, index) => (index === rowIndex ? optimisticRow : currentRow));
      });
    });

    const response = await fetch("/api/gstat", {
      body: JSON.stringify({
        id: row.id,
        row,
        rowData: draft
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    const result = (await response.json()) as { error?: string; row?: AppealRow };

    if (!response.ok || !result.row) {
      setMessage(result.error ?? "Could not save GSTAT row.");
      setIsSavingEditor(false);
      await loadRows();
      return;
    }

    startRowsTransition(() => {
      setRows((currentRows) => {
        if (editor.isNew) {
          return currentRows.map((currentRow, index) =>
            index === rowIndex ? normalizeRow(result.row!, rowIndex) : currentRow
          );
        }

        return currentRows.map((currentRow, index) =>
          index === rowIndex ? normalizeRow(result.row!, rowIndex) : currentRow
        );
      });
    });
    setIsSavingEditor(false);
    setMessage(`Saved row ${rowIndex + 1}. Audit log updated.`);
  }

  return (
    <main className={`min-h-screen overflow-hidden bg-[#f7f3ea] text-slate-950 ${isMaximized ? "px-2 py-2" : "px-2 py-3 sm:px-3 lg:px-4"}`}>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(20,184,166,0.18),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(217,70,239,0.16),transparent_26%),radial-gradient(circle_at_48%_92%,rgba(245,158,11,0.16),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <section className="mx-auto w-full max-w-none">
        {!isMaximized ? (
        <header className="workline-frame rounded-[20px] p-4 md:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-slate-950/10 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-700 shadow-sm"
                href="/"
              >
                <ArrowLeft className="size-3.5" />
                Workspace
              </Link>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300 via-sky-300 to-fuchsia-300 text-slate-950">
                  <Scale className="size-7" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">
                    Tribunal appeals register
                  </p>
                  <h1 className="mt-1 text-4xl font-black leading-tight text-slate-950">GSTAT</h1>
                </div>
              </div>
              <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Track appeal status, demand exposure, deposits, credentials,
                documents, and handling responsibility in one structured register.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric 
                icon={FileSpreadsheet} 
                label="Unique Appeals" 
                value={hasActiveFilters ? `${filteredUniqueAppeals} / ${uniqueAppeals}` : String(uniqueAppeals)} 
              />
              <Metric icon={ShieldCheck} label="Workspace" value="Protected" />
            </div>
          </div>
        </header>
        ) : null}

        <section className={`workline-frame rounded-[20px] p-1.5 md:p-2 ${isMaximized ? "" : "mt-4"}`}>
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {isMaximized ? (
                  <Link
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-700 shadow-sm"
                    href="/gstat"
                  >
                    <ArrowLeft className="size-3.5" />
                    Back
                  </Link>
                ) : null}
                <h2 className="text-xl font-black text-slate-950">
                  {isMaximized ? "GSTAT Register" : "Appeals Register"}
                </h2>
              </div>
              {message ? <p className="mt-1 text-sm font-bold text-emerald-700">{message}</p> : null}
              {isLoading ? <p className="mt-1 text-sm font-bold text-slate-500">Loading saved GSTAT data...</p> : null}
              {hasActiveFilters && (
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Showing <span className="font-black text-teal-700">{filteredRows.length}</span> rows 
                  ({filteredUniqueAppeals} unique appeals) of <span className="font-black text-slate-700">{rows.length}</span> total
                </p>
              )}
              {duplicateDrc07Numbers.size ? (
                <p className="mt-1 text-sm font-bold text-amber-700">
                  {duplicateDrc07Numbers.size} duplicate DRC 07 No. value{duplicateDrc07Numbers.size === 1 ? "" : "s"} highlighted.
                </p>
              ) : null}
              {duplicateOiaNumbers.size ? (
                <p className="mt-1 text-sm font-bold text-sky-700">
                  {duplicateOiaNumbers.size} grouped OIA No. value{duplicateOiaNumbers.size === 1 ? "" : "s"} highlighted.
                </p>
              ) : null}
              {blankRequiredCellCount ? (
                <p className="mt-1 text-sm font-bold text-rose-700">
                  {blankRequiredCellCount} blank cell{blankRequiredCellCount === 1 ? "" : "s"} highlighted.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {isMaximized && (
                <div className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm">
                  <FileSpreadsheet className="size-4" />
                  Unique Appeals: {hasActiveFilters ? `${filteredUniqueAppeals} / ${uniqueAppeals}` : String(uniqueAppeals)}
                </div>
              )}
              <input
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={importExcel}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Upload className="size-4" />
                Import Excel
              </button>
              <div className="relative">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  onClick={() => setIsColumnOptionsOpen((current) => !current)}
                  type="button"
                >
                  <Settings2 className="size-4" />
                  Column Options
                </button>
                {isColumnOptionsOpen ? (
                  <ColumnOptionsPanel
                    hiddenColumnKeys={hiddenColumnKeys}
                    onApply={applyColumnLayout}
                    onClose={() => setIsColumnOptionsOpen(false)}
                    orderedColumns={orderedColumns}
                  />
                ) : null}
              </div>
              {!isMaximized ? (
                <Link
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  href="/gstat/audit"
                  rel="noreferrer"
                  target="_blank"
                >
                  <History className="size-4" />
                  Audit Trail
                </Link>
              ) : null}
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black uppercase text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:bg-emerald-50 disabled:hover:shadow-sm"
                disabled={!selectedPoaRow}
                onClick={() => {
                  if (!selectedPoaRow) {
                    return;
                  }

                  downloadGstatPoa(selectedPoaRow.data);
                }}
                title={
                  selectedRowIndexes.length === 0
                    ? "Select one GSTAT row to generate POA"
                    : selectedRowIndexes.length > 1
                      ? "Select only one row to generate POA"
                      : "Generate POA / Vakalatnama from the selected row"
                }
                type="button"
              >
                <FileText className="size-4" />
                Generate POA
              </button>
              <a
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-black uppercase text-teal-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-100 hover:shadow-md"
                href={poaGptUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="size-4" />
                Use GPT for drafting POA
              </a>
              {!isMaximized ? (
                <Link
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  href="/gstat/max"
                  rel="noreferrer"
                  target="_blank"
                >
                  <Expand className="size-4" />
                  Maximise View
                </Link>
              ) : null}
              <div className="flex overflow-hidden rounded-xl shadow-sm">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 bg-slate-950 px-3 text-xs font-black uppercase text-white transition hover:bg-slate-800"
                  onClick={() => exportExcel("all")}
                  title="Export every GSTAT row"
                  type="button"
                >
                  <Download className="size-4" />
                  Full Table
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 border-l border-white/15 bg-slate-800 px-3 text-xs font-black uppercase text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!filteredRows.length}
                  onClick={() => exportExcel("current")}
                  title="Export the currently filtered and sorted GSTAT rows"
                  type="button"
                >
                  <Filter className="size-4" />
                  Current View
                </button>
              </div>
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-2 lg:flex-row">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Search className="size-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search all fields... (OIA No, Entity Name, Status, etc.)"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium focus:outline-none"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch("")}
                  className="text-slate-400 transition hover:text-slate-600"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:bg-white disabled:hover:shadow-sm"
              disabled={!hasActiveFilters}
              onClick={clearAllFilters}
              title="Clear search and every column filter"
              type="button"
            >
              <X className="size-4" />
              Clear All Filters
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-950/10 bg-white">
            <div className={`${isMaximized ? "max-h-[calc(100vh-82px)]" : "max-h-[calc(100vh-285px)]"} overflow-auto`}>
              <table
                className="table-fixed border-separate border-spacing-0 text-left text-[11px]"
                style={{ minWidth: visibleTableWidth, width: visibleTableWidth }}
              >
                <colgroup>
                  <col style={{ width: actionColumnWidth }} />
                  {visibleColumns.map((column) => (
                    <col key={`width-${column.key}`} style={{ width: getColumnWidth(column) }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-30 bg-slate-950 text-white">
                  <tr>
                    <th
                      className="sticky left-0 z-50 border-b border-r border-white/15 bg-slate-950 px-2 py-2 align-bottom font-black"
                      rowSpan={2}
                    >
                      <div className="space-y-2">
                        <span className="block">Row</span>
                        <div className="flex items-center gap-1">
                          <input
                            aria-label="Select visible rows"
                            checked={areAllVisibleRowsSelected}
                            className="size-4 rounded border-slate-300 accent-teal-600"
                            onChange={toggleVisibleRowSelection}
                            ref={(input) => {
                              if (input) {
                                input.indeterminate = areSomeVisibleRowsSelected;
                              }
                            }}
                            title="Select visible rows"
                            type="checkbox"
                          />
                          <button
                            className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-1.5 text-[10px] font-black uppercase text-teal-800 transition hover:bg-teal-100"
                            onClick={openNewEditor}
                            type="button"
                          >
                            <Plus className="size-3" />
                            Add
                          </button>
                          <button
                            aria-label="Delete selected rows"
                            className="inline-flex size-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!selectedRowIndexes.length}
                            onClick={deleteSelectedRows}
                            title={
                              selectedRowIndexes.length
                                ? `Delete ${selectedRowIndexes.length} selected row${selectedRowIndexes.length === 1 ? "" : "s"}`
                                : "Select rows to delete"
                            }
                            type="button"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </th>
                    {visibleColumns.map((column) => {
                      const isSnoColumn = column.key === "Sno";

                      return (
                        <th
                          className={`relative border-b border-r border-white/15 px-2 py-2 align-bottom font-black ${
                            isSnoColumn ? "sticky z-40 bg-slate-950" : ""
                          }`}
                          key={column.key}
                          style={isSnoColumn ? { left: actionColumnWidth } : undefined}
                        >
                          <ExcelColumnHeader
                            column={column}
                            columnValueFilters={columnValueFilters}
                            draftFilterValues={draftFilterValues}
                            filterSearch={filterSearch}
                            isOpen={openFilterColumnKey === column.key}
                            menuPosition={filterMenuPosition}
                            onApplyFilter={applyColumnFilter}
                            onClearFilter={clearColumnFilter}
                            onCloseFilter={closeColumnFilter}
                            onFilterSearchChange={setFilterSearch}
                            onOpenFilter={openColumnFilter}
                            onSetSort={setColumnSort}
                            onSort={toggleSort}
                            onToggleDraftFilterValue={toggleDraftFilterValue}
                            onToggleVisibleDraftFilterValues={toggleVisibleDraftFilterValues}
                            options={openFilterColumnKey === column.key ? openColumnFilterOptions : []}
                            sortState={sortState}
                            visibleOptions={openFilterColumnKey === column.key ? visibleColumnFilterOptions : []}
                          />
                        </th>
                      );
                    })}
                  </tr>
                  <tr>
                    {visibleColumns.map((column) => {
                      const isSnoColumn = column.key === "Sno";

                      return (
                        <th
                          className={`border-b border-r border-white/15 bg-slate-900 px-1.5 py-1.5 ${
                            isSnoColumn ? "sticky z-40" : ""
                          }`}
                          key={`filter-${column.key}`}
                          style={isSnoColumn ? { left: actionColumnWidth } : undefined}
                        >
                          <ExcelColumnTextFilter
                            column={column}
                            onChange={updateColumnTextFilter}
                            value={columnTextFilters[column.key] ?? ""}
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(({ row, originalIndex }, visibleIndex) => {
                    const duplicateDrc07Value = normalizeDuplicateValue(row.data["DRC 07 No"]);
                    const hasDuplicateDrc07 = duplicateDrc07Numbers.has(duplicateDrc07Value);
                    const duplicateOiaValue = normalizeDuplicateValue(row.data["OIA No"]);
                    const hasDuplicateOia = duplicateOiaNumbers.has(duplicateOiaValue);
                    const rowSelectionKey = getRowSelectionKey(row, originalIndex);
                    const isSelected = selectedRowKeys.has(rowSelectionKey);

                    return (
                      <tr
                        className={
                          hasDuplicateDrc07
                            ? "bg-amber-50"
                            : hasDuplicateOia
                              ? "bg-sky-50"
                              : "odd:bg-white even:bg-slate-50/80"
                        }
                        key={row.id ?? originalIndex}
                      >
                        <td className={`sticky left-0 z-20 h-8 whitespace-nowrap border-b border-r px-1.5 py-1 ${
                          hasDuplicateDrc07
                            ? "border-amber-200 bg-amber-50"
                            : hasDuplicateOia
                              ? "border-sky-200 bg-sky-50"
                              : "border-slate-200 bg-inherit"
                        }`}>
                          <div className="flex items-center gap-1">
                            <input
                              aria-label={`Select row ${row.data.Sno || visibleIndex + 1}`}
                              checked={isSelected}
                              className="size-4 shrink-0 rounded border-slate-300 accent-teal-600"
                              onChange={() => toggleRowSelection(row, originalIndex)}
                              type="checkbox"
                            />
                            <button
                              aria-label={`Edit row ${row.data.Sno || visibleIndex + 1}`}
                              className="inline-flex size-6 items-center justify-center rounded-md border border-sky-200 bg-white text-sky-700 transition hover:bg-sky-50"
                              onClick={() => openEditor(originalIndex, row)}
                              title="Edit row"
                              type="button"
                            >
                              <Pencil className="size-3" />
                            </button>
                            <button
                              aria-label={`Delete row ${row.data.Sno || visibleIndex + 1}`}
                              className="inline-flex size-6 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 transition hover:bg-rose-50"
                              onClick={() => deleteRow(originalIndex)}
                              title="Delete row"
                              type="button"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </td>
                        {visibleColumns.map((column) => {
                          const cellValue = row.data[column.key];
                          const displayValue = dateFields.has(column.key) ? formatDateForDisplay(cellValue) : cellValue;
                          const isSnoColumn = column.key === "Sno";
                          const isInlineEditable = canInlineEdit(column.key, userAccess);
                          const isInlineEditing =
                            inlineEditor?.rowIndex === originalIndex && inlineEditor.columnKey === column.key;
                          const isSavingInline =
                            savingInlineCell?.rowIndex === originalIndex && savingInlineCell.columnKey === column.key;
                          const isDuplicateDrc07 = hasDuplicateDrc07 && column.key === "DRC 07 No";
                          const isDuplicateOia = hasDuplicateOia && column.key === "OIA No";
                          const isRequiredBlank =
                            requiredBlankCheckColumns.some((requiredColumn) => requiredColumn.key === column.key) &&
                            isBlankCell(cellValue);

                          return (
                            <td
                              className={`h-8 border-b border-r px-1.5 py-1 font-semibold ${
                                isSnoColumn ? "sticky z-10 bg-inherit" : ""
                              } ${
                                isDuplicateDrc07
                                  ? "border-amber-300 bg-amber-100 text-amber-950"
                                  : isDuplicateOia
                                    ? "border-sky-300 bg-sky-100 text-sky-950"
                                  : isRequiredBlank
                                    ? "border-rose-200 bg-rose-50 text-rose-900"
                                  : hasDuplicateDrc07
                                    ? "border-amber-200 bg-amber-50 text-slate-800"
                                    : hasDuplicateOia
                                      ? "border-sky-200 bg-sky-50 text-slate-800"
                                    : "border-slate-200 text-slate-700"
                              }`}
                              key={`${originalIndex}-${column.key}`}
                              style={isSnoColumn ? { left: actionColumnWidth } : undefined}
                            >
                              {column.key === "Sno" ? (
                                row.row_number || row.data.Sno || originalIndex + 1
                              ) : isInlineEditing ? (
                                <input
                                  autoFocus
                                  className="h-7 w-full rounded-md border border-teal-300 bg-white px-1.5 text-[11px] font-bold text-slate-950 outline-none ring-2 ring-teal-100"
                                  onBlur={saveInlineEditor}
                                  onChange={(event) =>
                                    setInlineEditor((currentEditor) =>
                                      currentEditor ? { ...currentEditor, value: event.target.value } : currentEditor
                                    )
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      cancelInlineEditor();
                                    }
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      saveInlineEditor();
                                    }
                                  }}
                                  type={dateFields.has(column.key) ? "date" : "text"}
                                  value={inlineEditor.value}
                                />
                              ) : (
                                <button
                                  className={`block w-full min-w-0 truncate rounded px-1.5 text-left ${
                                    isInlineEditable ? "cursor-text hover:bg-white/80 hover:ring-1 hover:ring-teal-200" : ""
                                  }`}
                                  disabled={!isInlineEditable || Boolean(isSavingInline)}
                                  onClick={() => openInlineEditor(originalIndex, column, cellValue)}
                                  title={
                                    isDuplicateDrc07
                                      ? `Duplicate DRC 07 No.: ${cellValue}`
                                      : isDuplicateOia
                                        ? `Grouped OIA No.: ${cellValue}`
                                      : isRequiredBlank
                                        ? `${column.label} is blank`
                                        : String(displayValue ?? "")
                                  }
                                  type="button"
                                >
                                  {isSavingInline ? "Saving..." : isRequiredBlank ? "Required" : displayValue ?? ""}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>
      {editor ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
          <button
            aria-label="Close editor"
            className="absolute inset-0 cursor-default"
            onClick={() => setEditor(null)}
            type="button"
          />
          <aside className="relative flex h-full w-[calc(100vw-20px)] max-w-none flex-col border-l border-slate-950/10 bg-white shadow-2xl">
            <div className="shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">GSTAT row editor</p>
                  <h3 className="mt-1 text-xl font-black text-slate-950">Appeal {editor.draft.Sno || editor.rowIndex + 1}</h3>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-950/10 bg-white px-4 text-xs font-black uppercase text-slate-700 shadow-sm"
                    onClick={() => setEditor(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSavingEditor}
                    onClick={saveEditor}
                    type="button"
                  >
                    {isSavingEditor ? "Saving..." : "Save Row"}
                  </button>
                  <button
                    className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                    onClick={() => setEditor(null)}
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                {editorSections.map((section) => (
                  <section
                    className={`rounded-xl border border-slate-200 bg-slate-50/70 p-3 ${
                      section.title === "Demand and deposit" ? "xl:col-span-2 2xl:col-span-2" : ""
                    }`}
                    key={section.title}
                  >
                    <h4 className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">{section.title}</h4>
                    <div className="mt-2 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                      {section.fields.map((field) => (
                        <label className="block" key={field}>
                          <span className="text-[10px] font-black uppercase text-slate-500">{field}</span>
                          {field === "Person handling" ? (
                            <select
                              className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition disabled:bg-slate-100 disabled:text-slate-600 focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                              disabled={isPersonHandlingLocked(userAccess)}
                              onChange={(event) => updateDraft(field, event.target.value)}
                              value={editor.draft[field] ?? ""}
                            >
                              <option value="">Select team</option>
                              {teamOptions.map((team) => (
                                <option key={team} value={team}>
                                  {team}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                              onChange={(event) => updateDraft(field, event.target.value)}
                              type={dateFields.has(field) ? "date" : "text"}
                              value={editor.draft[field] ?? ""}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    {section.title === "Demand and deposit" ? (
                      <div className="mt-3 grid gap-2 lg:grid-cols-3">
                        {demandEditorGroups.map((group) => (
                          <div className="rounded-lg border border-slate-200 bg-white p-2" key={group.title}>
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                              {group.title}
                            </p>
                            <div className="mt-2 grid gap-2">
                              {group.fields.map((field) => (
                                <label className="block" key={field}>
                                  <span className="text-[10px] font-black uppercase text-slate-500">
                                    {field.split(" - ").pop()}
                                  </span>
                                  <input
                                    className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                                    onChange={(event) => updateDraft(field, event.target.value)}
                                    value={editor.draft[field] ?? ""}
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function createEmptyRows(count: number): AppealRow[] {
  return Array.from({ length: count }, (_, index) => createEmptyRow(index + 1));
}

function createEmptyRow(rowNumber: number): AppealRow {
  return {
    data: columns.reduce<RowData>((row, column) => {
      row[column.key] = column.key === "Sno" ? rowNumber : "";
      return row;
    }, {}),
    row_number: rowNumber
  };
}

function renumberRows(rows: AppealRow[]) {
  return rows.map((row, index) => ({
    ...row,
    data: { ...row.data, Sno: index + 1 },
    row_number: index + 1
  }));
}

function getRowSelectionKey(row: AppealRow | undefined, index: number) {
  return row?.id ? `id:${row.id}` : `index:${index}`;
}

function normalizeRows(rows: AppealRow[]) {
  return rows.map((row, index) => normalizeRow(row, index));
}

function normalizeRow(row: AppealRow, index: number): AppealRow {
  const rowNumber = row.row_number ?? index + 1;

  return {
    ...row,
    data: columns.reduce<RowData>((data, column) => {
      data[column.key] =
        column.key === "Sno"
          ? rowNumber
          : dateFields.has(column.key)
            ? normalizeDateValue(row.data?.[column.key])
            : row.data?.[column.key] ?? "";
      return data;
    }, {}),
    row_number: rowNumber
  };
}

function isPersonHandlingLocked(access: UserAccess) {
  return !access.isPartner && Boolean(access.team);
}

function canInlineEdit(field: string, _access: UserAccess) {
  return field !== "Sno" && field !== "Person handling";
}

function applyPersonHandlingForAccess(data: RowData, access: UserAccess): RowData {
  if (!isPersonHandlingLocked(access)) {
    return { ...data };
  }

  return { ...data, "Person handling": access.team };
}

function styleGstatWorksheet(
  worksheet: XLSX.WorkSheet,
  exportRows: ExportRow[],
  exportDuplicateDrc07Numbers: Set<string>,
  exportDuplicateOiaNumbers: Set<string>
) {
  const headerStyle = createExcelCellStyle("0f172a", "ffffff", true);
  const groupHeaderStyle = createExcelCellStyle("111827", "ffffff", true);
  const baseCellStyle = createExcelCellStyle("ffffff", "334155");
  const alternateCellStyle = createExcelCellStyle("f8fafc", "334155");
  const duplicateRowStyle = createExcelCellStyle("fffbeb", "1e293b");
  const duplicateDrcStyle = createExcelCellStyle("fef3c7", "78350f", true);
  const groupedOiaRowStyle = createExcelCellStyle("f0f9ff", "1e293b");
  const groupedOiaStyle = createExcelCellStyle("e0f2fe", "0c4a6e", true);
  const blankRequiredStyle = createExcelCellStyle("fff1f2", "9f1239", true);

  for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      setCellStyle(worksheet, rowIndex, columnIndex, columnIndex < baseColumns.length ? headerStyle : groupHeaderStyle);
    }
  }

  exportRows.forEach(({ row }, rowIndex) => {
    const worksheetRowIndex = rowIndex + 2;
    const hasDuplicateDrc07 = exportDuplicateDrc07Numbers.has(normalizeDuplicateValue(row.data["DRC 07 No"]));
    const hasDuplicateOia = exportDuplicateOiaNumbers.has(normalizeDuplicateValue(row.data["OIA No"]));
    const rowStyle = hasDuplicateDrc07
      ? duplicateRowStyle
      : hasDuplicateOia
        ? groupedOiaRowStyle
        : rowIndex % 2 === 0
          ? baseCellStyle
          : alternateCellStyle;

    columns.forEach((column, columnIndex) => {
      const cellValue = row.data[column.key];
      const isDuplicateDrc07 = hasDuplicateDrc07 && column.key === "DRC 07 No";
      const isDuplicateOia = hasDuplicateOia && column.key === "OIA No";
      const isRequiredBlank =
        requiredBlankCheckColumns.some((requiredColumn) => requiredColumn.key === column.key) &&
        isBlankCell(cellValue);

      setCellStyle(
        worksheet,
        worksheetRowIndex,
        columnIndex,
        isDuplicateDrc07
          ? duplicateDrcStyle
          : isDuplicateOia
            ? groupedOiaStyle
            : isRequiredBlank
              ? blankRequiredStyle
              : rowStyle
      );
    });
  });
}

function getColumnWidth(column: Column) {
  return columnWidths[column.key] ?? defaultColumnWidth;
}

function getSavedColumnLayout(): ColumnLayout {
  if (typeof window === "undefined") {
    return { hiddenColumnKeys: [], order: defaultColumnOrder };
  }

  try {
    const savedLayout = window.localStorage.getItem(columnLayoutStorageKey);

    if (!savedLayout) {
      return { hiddenColumnKeys: [], order: defaultColumnOrder };
    }

    return normalizeColumnLayout(JSON.parse(savedLayout) as Partial<ColumnLayout>);
  } catch {
    return { hiddenColumnKeys: [], order: defaultColumnOrder };
  }
}

function saveColumnLayout(layout: ColumnLayout) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(columnLayoutStorageKey, JSON.stringify(normalizeColumnLayout(layout)));
}

function normalizeColumnLayout(layout: Partial<ColumnLayout>): ColumnLayout {
  const knownColumnKeys = new Set(defaultColumnOrder);
  const savedOrder = Array.isArray(layout.order) ? layout.order.filter((key) => knownColumnKeys.has(key)) : [];
  const order = [...savedOrder, ...defaultColumnOrder.filter((key) => !savedOrder.includes(key))];
  const hiddenColumnKeys = Array.isArray(layout.hiddenColumnKeys)
    ? layout.hiddenColumnKeys.filter((key) => knownColumnKeys.has(key))
    : [];

  return { hiddenColumnKeys, order };
}

function compareRowsForColumn(
  left: { row: AppealRow; originalIndex: number },
  right: { row: AppealRow; originalIndex: number },
  column: Column,
  direction: SortDirection
) {
  const leftValue = column.key === "Sno" ? left.row.row_number : left.row.data[column.key];
  const rightValue = column.key === "Sno" ? right.row.row_number : right.row.data[column.key];
  const leftBlank = isBlankCell(leftValue);
  const rightBlank = isBlankCell(rightValue);

  if (leftBlank && rightBlank) {
    return left.originalIndex - right.originalIndex;
  }

  if (leftBlank) {
    return 1;
  }

  if (rightBlank) {
    return -1;
  }

  const comparison = compareCellValues(leftValue, rightValue, column);

  if (comparison === 0) {
    return left.originalIndex - right.originalIndex;
  }

  return direction === "asc" ? comparison : -comparison;
}

function compareCellValues(leftValue: string | number | undefined, rightValue: string | number | undefined, column: Column) {
  if (dateFields.has(column.key)) {
    return normalizeDateValue(leftValue).localeCompare(normalizeDateValue(rightValue));
  }

  const leftNumber = parseSortableNumber(leftValue);
  const rightNumber = parseSortableNumber(rightValue);

  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber - rightNumber;
  }

  return String(leftValue ?? "").localeCompare(String(rightValue ?? ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function parseSortableNumber(value: string | number | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalizedValue = String(value ?? "").replace(/,/g, "").trim();

  if (!/^-?\d+(\.\d+)?$/.test(normalizedValue)) {
    return null;
  }

  return Number(normalizedValue);
}

function setCellStyle(worksheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number, style: CellStyle) {
  const address = XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex });
  const cell = worksheet[address];

  if (!cell || typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
    return;
  }

  cell.s = style;
}

function createExcelCellStyle(fillColor: string, fontColor: string, isBold = false): CellStyle {
  const border = {
    bottom: { color: { rgb: "cbd5e1" }, style: "thin" },
    left: { color: { rgb: "cbd5e1" }, style: "thin" },
    right: { color: { rgb: "cbd5e1" }, style: "thin" },
    top: { color: { rgb: "cbd5e1" }, style: "thin" }
  };

  return {
    alignment: { vertical: "center", wrapText: true },
    border,
    fill: { fgColor: { rgb: fillColor }, patternType: "solid" },
    font: { bold: isBold, color: { rgb: fontColor } }
  };
}

function findDuplicateValues(rows: AppealRow[], field: string) {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    const value = normalizeDuplicateValue(row.data[field]);

    if (!value) {
      return;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value)
  );
}

function normalizeDuplicateValue(value: string | number | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isBlankCell(value: string | number | undefined) {
  return String(value ?? "").trim() === "";
}

function normalizeDateValue(value: string | number | undefined) {
  if (value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return "";
    }

    return [
      parsed.y,
      String(parsed.m).padStart(2, "0"),
      String(parsed.d).padStart(2, "0")
    ].join("-");
  }

  const trimmedValue = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const parsedDate = new Date(trimmedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return [
    parsedDate.getFullYear(),
    String(parsedDate.getMonth() + 1).padStart(2, "0"),
    String(parsedDate.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDateForDisplay(value: string | number | undefined) {
  const normalizedValue = normalizeDateValue(value);

  if (!normalizedValue) {
    return "";
  }

  const [year, month, day] = normalizedValue.split("-");
  const monthLabel = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Number(month) - 1
  ];

  if (!year || !monthLabel || !day) {
    return "";
  }

  return `${day}-${monthLabel}-${year}`;
}

function matchesColumnFilter(
  value: string | number | undefined,
  column: Column,
  rawFilter: string | undefined,
  context: { duplicateOiaNumbers: Set<string> }
) {
  const filter = rawFilter?.trim().toLowerCase();

  if (!filter) {
    return true;
  }

  const isRequiredBlank =
    requiredBlankCheckColumns.some((requiredColumn) => requiredColumn.key === column.key) &&
    isBlankCell(value);

  if (["blank", "empty", "required"].includes(filter)) {
    return isRequiredBlank || (filter !== "required" && isBlankCell(value));
  }

  if (column.key === "OIA No" && isGroupedOiaSearch(filter)) {
    return context.duplicateOiaNumbers.has(normalizeDuplicateValue(value));
  }

  const rawValue = String(value ?? "").toLowerCase();
  const displayValue = dateFields.has(column.key) ? formatDateForDisplay(value).toLowerCase() : "";

  return rawValue.includes(filter) || displayValue.includes(filter);
}

function getCellDisplayValue(value: string | number | undefined, column: Column) {
  if (column.key === "Sno") {
    return String(value ?? "");
  }

  return dateFields.has(column.key) ? formatDateForDisplay(value) : String(value ?? "").trim();
}

function getColumnFilterValueKey(value: string | number | undefined, column: Column) {
  const displayValue = getCellDisplayValue(value, column);
  return displayValue ? displayValue : blankColumnFilterValue;
}

function getColumnFilterValueLabel(valueKey: string) {
  return valueKey === blankColumnFilterValue ? "(Blank)" : valueKey;
}

function getUniqueColumnFilterOptions(rows: AppealRow[], column: Column, limit?: number): ColumnFilterOption[] {
  const values = new Set<string>();

  for (const row of rows) {
    values.add(getColumnFilterValueKey(row.data[column.key], column));

    if (limit && values.size >= limit) {
      break;
    }
  }

  return Array.from(values)
    .sort((left, right) =>
      getColumnFilterValueLabel(left).localeCompare(getColumnFilterValueLabel(right), undefined, {
        numeric: true,
        sensitivity: "base"
      })
    )
    .map((value) => ({ key: value, label: getColumnFilterValueLabel(value) }));
}

function isGroupedOiaSearch(filter: string) {
  return ["duplicate", "duplicates", "grouped"].includes(filter);
}

function SortColumnHeader({
  column,
  isCentered = false,
  onSort,
  sortState
}: {
  column: Column;
  isCentered?: boolean;
  onSort: (column: Column) => void;
  sortState: SortState;
}) {
  const isAscending = sortState?.columnKey === column.key && sortState.direction === "asc";
  const isDescending = sortState?.columnKey === column.key && sortState.direction === "desc";
  const sortLabel = column.group ? `${column.group} ${column.label}` : column.label;

  return (
    <button
      aria-label={`Sort by ${sortLabel}`}
      className={`flex w-full min-w-0 items-center gap-1 ${
        isCentered ? "justify-center" : "justify-between text-left"
      }`}
      onClick={() => onSort(column)}
      title={sortLabel}
      type="button"
    >
      <span className={`min-w-0 whitespace-normal break-words leading-tight ${isCentered ? "text-center" : "text-left"}`}>
        {column.label}
      </span>
      <span className="flex shrink-0 flex-col leading-none">
        <ArrowUp className={`size-3 ${isAscending ? "text-cyan-200" : "text-white/35"}`} />
        <ArrowDown className={`-mt-1 size-3 ${isDescending ? "text-cyan-200" : "text-white/35"}`} />
      </span>
    </button>
  );
}

function ExcelColumnHeader({
  column,
  columnValueFilters,
  draftFilterValues,
  filterSearch,
  isCentered = false,
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
  options,
  sortState,
  visibleOptions
}: {
  column: Column;
  columnValueFilters: ColumnValueFilters;
  draftFilterValues: string[];
  filterSearch: string;
  isCentered?: boolean;
  isOpen: boolean;
  menuPosition: FilterMenuPosition | null;
  onApplyFilter: (column: Column) => void;
  onClearFilter: (column: Column) => void;
  onCloseFilter: () => void;
  onFilterSearchChange: (value: string) => void;
  onOpenFilter: (column: Column, anchor: HTMLElement) => void;
  onSetSort: (column: Column, direction: SortDirection) => void;
  onSort: (column: Column) => void;
  onToggleDraftFilterValue: (value: string) => void;
  onToggleVisibleDraftFilterValues: () => void;
  options: ColumnFilterOption[];
  sortState: SortState;
  visibleOptions: ColumnFilterOption[];
}) {
  const isAscending = sortState?.columnKey === column.key && sortState.direction === "asc";
  const isDescending = sortState?.columnKey === column.key && sortState.direction === "desc";
  const hasFilter = Boolean(columnValueFilters[column.key]?.length);
  const visibleValueKeys = visibleOptions.map((option) => option.key);
  const selectedVisibleCount = visibleValueKeys.filter((value) => draftFilterValues.includes(value)).length;
  const areAllVisibleValuesSelected = visibleValueKeys.length > 0 && selectedVisibleCount === visibleValueKeys.length;
  const areSomeVisibleValuesSelected = selectedVisibleCount > 0 && !areAllVisibleValuesSelected;
  const headerLabel = column.group ? `${column.group} ${column.label}` : column.label;

  return (
    <div className="relative">
      <div className={`flex min-w-0 items-center gap-1 ${isCentered ? "justify-center" : "justify-between text-left"}`}>
        <button
          aria-label={`Sort by ${headerLabel}`}
          className={`flex min-w-0 flex-1 items-center gap-1 ${isCentered ? "justify-center" : "justify-between text-left"}`}
          onClick={() => onSort(column)}
          title={headerLabel}
          type="button"
        >
          <span className={`min-w-0 whitespace-normal break-words leading-tight ${isCentered ? "text-center" : "text-left"}`}>
            {column.group ? (
              <>
                <span className="block text-[9px] uppercase text-cyan-100/80">{column.group}</span>
                <span className="block">{column.label}</span>
              </>
            ) : (
              column.label
            )}
          </span>
          <span className="flex shrink-0 flex-col leading-none">
            <ArrowUp className={`size-3 ${isAscending ? "text-cyan-200" : "text-white/35"}`} />
            <ArrowDown className={`-mt-1 size-3 ${isDescending ? "text-cyan-200" : "text-white/35"}`} />
          </span>
        </button>
        <button
          aria-label={`Open filter for ${headerLabel}`}
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded border transition ${
            hasFilter
              ? "border-cyan-200 bg-cyan-200 text-slate-950"
              : "border-white/15 bg-white/10 text-white hover:bg-white/20"
          }`}
          onClick={(event) => onOpenFilter(column, event.currentTarget)}
          title={`Filter ${headerLabel}`}
          type="button"
        >
          <Filter className="size-3" />
        </button>
      </div>

      {isOpen && menuPosition ? (
        <div
          className="fixed z-[1000] w-72 overflow-hidden rounded-lg border border-slate-300 bg-white p-2 text-left text-slate-900 shadow-2xl"
          style={{
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
            top: menuPosition.top
          }}
        >
          <div className="space-y-1 border-b border-slate-200 pb-2">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold transition hover:bg-slate-100"
              onClick={() => {
                onSetSort(column, "asc");
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
                onSetSort(column, "desc");
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
            onClick={() => onClearFilter(column)}
            type="button"
          >
            <X className="size-4" />
            Clear Filter From "{column.label}"
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
              className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              onClick={() => onApplyFilter(column)}
              type="button"
            >
              OK
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5">
            <Search className="size-4 text-slate-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
              onChange={(event) => onFilterSearchChange(event.target.value)}
              placeholder="Search"
              value={filterSearch}
            />
          </div>

          <div className="mt-2 overflow-y-auto border border-slate-200 bg-slate-50 p-2" style={{ maxHeight: Math.max(120, menuPosition.maxHeight - 196) }}>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-950">
              <input
                checked={areAllVisibleValuesSelected}
                className="size-4 accent-slate-950"
                onChange={onToggleVisibleDraftFilterValues}
                ref={(input) => {
                  if (input) {
                    input.indeterminate = areSomeVisibleValuesSelected;
                  }
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
                    <span className="min-w-0 truncate" title={option.label}>
                      {option.label}
                    </span>
                  </label>
                ))
              ) : (
                <p className="py-6 text-center text-sm font-semibold text-slate-500">No values found</p>
              )}
            </div>
          </div>

          {options.length >= columnFilterOptionLimit ? (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Showing first {columnFilterOptionLimit} unique values.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ExcelColumnTextFilter({
  column,
  onChange,
  value
}: {
  column: Column;
  onChange: (column: Column, value: string) => void;
  value: string;
}) {
  const headerLabel = column.group ? `${column.group} ${column.label}` : column.label;

  return (
    <input
      aria-label={`Type to filter ${headerLabel}`}
      className="h-8 w-full rounded-md border border-white/15 bg-white px-2 text-[11px] font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200"
      onChange={(event) => onChange(column, event.target.value)}
      placeholder="Filter"
      title={`Type to filter ${headerLabel}`}
      type="text"
      value={value}
    />
  );
}

function ColumnOptionsPanel({
  hiddenColumnKeys,
  onApply,
  onClose,
  orderedColumns
}: {
  hiddenColumnKeys: Set<string>;
  onApply: (layout: ColumnLayout) => void;
  onClose: () => void;
  orderedColumns: Column[];
}) {
  const [draftOrder, setDraftOrder] = useState<string[]>(() => orderedColumns.map((column) => column.key));
  const [draftHiddenColumnKeys, setDraftHiddenColumnKeys] = useState<Set<string>>(() => new Set(hiddenColumnKeys));
  const draftColumns = useMemo(
    () =>
      draftOrder
        .map((columnKey) => columnByKey.get(columnKey))
        .filter((column): column is Column => Boolean(column)),
    [draftOrder]
  );
  const visibleCount = useMemo(
    () => draftColumns.filter((column) => !draftHiddenColumnKeys.has(column.key)).length,
    [draftColumns, draftHiddenColumnKeys]
  );

  function toggleDraftColumn(column: Column) {
    setDraftHiddenColumnKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (nextKeys.has(column.key)) {
        nextKeys.delete(column.key);
      } else {
        nextKeys.add(column.key);
      }

      return nextKeys;
    });
  }

  function moveDraftColumn(column: Column, direction: "up" | "down") {
    setDraftOrder((currentOrder) => {
      const currentIndex = currentOrder.indexOf(column.key);

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

  function resetDraftLayout() {
    setDraftOrder(defaultColumnOrder);
    setDraftHiddenColumnKeys(new Set());
  }

  function saveDraftLayout() {
    onApply({
      hiddenColumnKeys: Array.from(draftHiddenColumnKeys),
      order: draftOrder
    });
  }

  return (
    <div className="absolute right-0 top-12 z-[900] w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div>
          <p className="text-xs font-black uppercase text-slate-950">Column Options</p>
          <p className="text-[11px] font-bold text-slate-500">{visibleCount} visible columns</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-black uppercase text-slate-700 transition hover:bg-slate-50"
            onClick={resetDraftLayout}
            type="button"
          >
            Reset
          </button>
          <button
            aria-label="Close column options"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-2">
        {draftColumns.map((column, index) => {
          const isHidden = draftHiddenColumnKeys.has(column.key);

          return (
            <ColumnOptionsRow
              column={column}
              index={index}
              isHidden={isHidden}
              key={column.key}
              onMove={moveDraftColumn}
              onToggle={toggleDraftColumn}
              totalColumns={draftColumns.length}
            />
          );
        })}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
        <button
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black uppercase text-slate-700 transition hover:bg-slate-50"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="inline-flex h-9 items-center rounded-lg bg-slate-950 px-4 text-xs font-black uppercase text-white transition hover:bg-slate-800"
          onClick={saveDraftLayout}
          type="button"
        >
          Save
        </button>
      </div>
    </div>
  );
}

const ColumnOptionsRow = memo(function ColumnOptionsRow({
  column,
  index,
  isHidden,
  onMove,
  onToggle,
  totalColumns
}: {
  column: Column;
  index: number;
  isHidden: boolean;
  onMove: (column: Column, direction: "up" | "down") => void;
  onToggle: (column: Column) => void;
  totalColumns: number;
}) {
  const label = column.group ? `${column.group} - ${column.label}` : column.label;

  return (
    <div
      className={`mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-2 py-2 ${
        isHidden ? "border-slate-200 bg-slate-50 text-slate-500" : "border-slate-200 bg-white text-slate-950"
      }`}
    >
      <label className="flex min-w-0 cursor-pointer items-center gap-2">
        <input
          checked={!isHidden}
          className="size-4 accent-slate-950"
          onChange={() => onToggle(column)}
          type="checkbox"
        />
        <span className="min-w-0 truncate text-xs font-black" title={label}>
          {label}
        </span>
      </label>
      <div className="flex items-center gap-1">
        <button
          aria-label={`Move ${label} up`}
          className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
          disabled={index === 0}
          onClick={() => onMove(column, "up")}
          type="button"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          aria-label={`Move ${label} down`}
          className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
          disabled={index === totalColumns - 1}
          onClick={() => onMove(column, "down")}
          type="button"
        >
          <ArrowDown className="size-3.5" />
        </button>
      </div>
    </div>
  );
});

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof FileSpreadsheet;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-950/10 bg-white p-4 shadow-sm ring-1 ring-white/70">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-xs font-black uppercase text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function findHeaderRow(rawRows: Array<Array<string | number>>) {
  const headerIndex = rawRows.findIndex((row) =>
    row.some((value) => String(value).trim().toLowerCase() === "sno")
  );

  if (headerIndex === -1) {
    throw new Error("Could not find the GSTAT header row. Please make sure the Excel file has a Sno column.");
  }

  return headerIndex;
}
