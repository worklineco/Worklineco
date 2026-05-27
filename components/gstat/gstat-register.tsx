"use client";

import { ArrowLeft, Download, Expand, FileSpreadsheet, Pencil, Plus, Scale, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Column = { group?: string; key: string; label: string };
type RowData = Record<string, string | number>;
type AppealRow = {
  data: RowData;
  id?: string;
  row_number: number;
  updated_at?: string;
};
type EditorState = { draft: RowData; isNew?: boolean; row: AppealRow; rowIndex: number };

const baseColumns: Column[] = [
  "Sno",
  "Person handling",
  "Status",
  "Entity Group",
  "Entity Name",
  "State Name",
  "FY",
  "OIO No",
  "OIO Date",
  "DRC 07 No",
  "DRC 07 Date",
  "OIA No",
  "OIA Date",
  "APL 04 No",
  "APL 04 Date",
  "Favourablle/Against",
  "Additional 10% compliances",
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
const finalColumns: Column[] = [{ key: "Pre Deposit Workings", label: "Pre Deposit Workings" }];
const columns = [...baseColumns, ...demandColumns, ...finalColumns];
const actionColumnKey = "__row_actions";
const columnStorageKey = "workline-gstat-column-widths";
const defaultColumnWidth = 160;
const defaultActionColumnWidth = 94;
const editorSections = [
  {
    fields: [
      "Sno",
      "Person handling",
      "Status",
      "Entity Group",
      "Entity Name",
      "State Name",
      "FY",
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
      "Favourablle/Against",
      "Additional 10% compliances",
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
      "Refund / Fees",
      "Pre Deposit Workings"
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

const initialRows = createEmptyRows(12);

export function GstatRegister({ isMaximized = false }: { isMaximized?: boolean }) {
  const [rows, setRows] = useState<AppealRow[]>(initialRows);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uniqueAppeals = useMemo(
    () =>
      rows.filter((row) =>
        columns.some((column) => column.key !== "Sno" && String(row.data[column.key] ?? "").trim())
      ).length,
    [rows]
  );
  const filteredRows = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, originalIndex: index }))
        .filter(({ row }) =>
          columns.every((column) => {
            const filter = filters[column.key]?.trim().toLowerCase();

            if (!filter) {
              return true;
            }

            return String(row.data[column.key] ?? "")
              .toLowerCase()
              .includes(filter);
          })
        ),
    [filters, rows]
  );
  const tableWidth = useMemo(
    () => columnWidth(actionColumnKey) + columns.reduce((total, column) => total + columnWidth(column.key), 0),
    [columnWidths]
  );

  useEffect(() => {
    loadRows();
  }, []);

  useEffect(() => {
    try {
      const storedWidths = window.localStorage.getItem(columnStorageKey);

      if (storedWidths) {
        setColumnWidths(JSON.parse(storedWidths) as Record<string, number>);
      }
    } catch {
      window.localStorage.removeItem(columnStorageKey);
    }
  }, []);

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
    setIsLoading(false);
  }

  function exportExcel() {
    const headerRowOne = [
      ...baseColumns.map((column) => column.label),
      ...groupedColumns.flatMap((group) => [group.label, "", ""]),
      ...finalColumns.map((column) => column.label)
    ];
    const headerRowTwo = [
      ...baseColumns.map(() => ""),
      ...groupedColumns.flatMap((group) => group.columns),
      ...finalColumns.map(() => "")
    ];
    const dataRows = rows.map((row, index) =>
      columns.map((column) => (column.key === "Sno" ? row.data[column.key] || index + 1 : row.data[column.key] ?? ""))
    );
    const worksheet = XLSX.utils.aoa_to_sheet([headerRowOne, headerRowTwo, ...dataRows]);

    worksheet["!merges"] = [
      ...baseColumns.map((_, index) => ({ e: { c: index, r: 1 }, s: { c: index, r: 0 } })),
      ...groupedColumns.map((_, index) => {
        const start = baseColumns.length + index * 3;
        return { e: { c: start + 2, r: 0 }, s: { c: start, r: 0 } };
      }),
      { e: { c: columns.length - 1, r: 1 }, s: { c: columns.length - 1, r: 0 } }
    ];
    worksheet["!cols"] = columns.map((column) => ({ wch: Math.max(12, column.label.length + 3) }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "GSTAT");
    XLSX.writeFile(workbook, "workline-gstat-register.xlsx");
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
              column.key === "Sno" ? rawRow[columnIndex] || rowIndex + 1 : rawRow[columnIndex] ?? "";
            return row;
          }, {}),
          row_number: rowIndex + 1
        }));

      if (!nextRows.length) {
        setMessage("No GSTAT rows found in the selected Excel file.");
        event.target.value = "";
        return;
      }

      setRows(normalizeRows(nextRows));

      const response = await fetch("/api/gstat", {
        body: JSON.stringify({ action: "import", rows: nextRows }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { error?: string; rows?: AppealRow[] };

      if (!response.ok) {
        setMessage(
          `${nextRows.length} row${nextRows.length === 1 ? "" : "s"} imported for preview, but not saved: ${
            result.error ?? "database save failed"
          }`
        );
        event.target.value = "";
        return;
      }

      setRows(result.rows?.length ? normalizeRows(result.rows) : normalizeRows(nextRows));
      setMessage(`${nextRows.length} row${nextRows.length === 1 ? "" : "s"} imported from ${file.name}. Audit log updated.`);
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
    await saveRowOperation("row_delete", rowIndex, `Deleted row ${rowLabel}. Audit log updated.`);
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
    setMessage(successMessage);
  }

  function openNewEditor() {
    const row = createEmptyRow(rows.length + 1);

    setEditor({
      draft: { ...row.data },
      isNew: true,
      row,
      rowIndex: rows.length
    });
  }

  function openEditor(rowIndex: number, row = rows[rowIndex]) {
    if (!row) {
      return;
    }

    setEditor({
      draft: { ...row.data },
      row,
      rowIndex
    });
  }

  function updateDraft(field: string, value: string) {
    setEditor((currentEditor) =>
      currentEditor
        ? {
            ...currentEditor,
            draft: { ...currentEditor.draft, [field]: value }
          }
        : currentEditor
    );
  }

  async function saveEditor() {
    if (!editor) {
      return;
    }

    const rowIndex = editor.rowIndex;
    const row = editor.isNew ? editor.row : rows[rowIndex];

    if (!row) {
      return;
    }

    const response = await fetch("/api/gstat", {
      body: JSON.stringify({
        id: row.id,
        row,
        rowData: editor.draft
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    const result = (await response.json()) as { error?: string; row?: AppealRow };

    if (!response.ok || !result.row) {
      setMessage(result.error ?? "Could not save GSTAT row.");
      return;
    }

    setRows((currentRows) => {
      if (editor.isNew) {
        return normalizeRows([...currentRows, result.row!]);
      }

      return currentRows.map((currentRow, index) =>
        index === rowIndex ? normalizeRow(result.row!, rowIndex) : currentRow
      );
    });
    setEditor(null);
    setMessage(`Saved row ${editor.draft.Sno || rowIndex + 1}. Audit log updated.`);
  }

  function columnWidth(columnKey: string) {
    return columnWidths[columnKey] ?? (columnKey === actionColumnKey ? defaultActionColumnWidth : defaultColumnWidth);
  }

  function startColumnResize(columnKey: string, event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = columnWidth(columnKey);

    function onPointerMove(moveEvent: PointerEvent) {
      const nextWidth = Math.max(72, Math.round(startWidth + moveEvent.clientX - startX));

      setColumnWidths((currentWidths) => {
        const nextWidths = { ...currentWidths, [columnKey]: nextWidth };
        window.localStorage.setItem(columnStorageKey, JSON.stringify(nextWidths));
        return nextWidths;
      });
    }

    function onPointerUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return (
    <main className={`min-h-screen overflow-hidden bg-[#f7f3ea] text-slate-950 ${isMaximized ? "px-2 py-2" : "px-4 py-4 sm:px-6 lg:px-8"}`}>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(20,184,166,0.18),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(217,70,239,0.16),transparent_26%),radial-gradient(circle_at_48%_92%,rgba(245,158,11,0.16),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <section className={isMaximized ? "mx-auto max-w-none" : "mx-auto max-w-[1680px]"}>
        {!isMaximized ? (
        <header className="workline-frame rounded-[28px] p-5 md:p-6">
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
              <Metric icon={FileSpreadsheet} label="Unique Appeals" value={String(uniqueAppeals)} />
              <Metric icon={ShieldCheck} label="Workspace" value="Protected" />
            </div>
          </div>
        </header>
        ) : null}

        <section className={`workline-frame rounded-[28px] p-2 md:p-3 ${isMaximized ? "" : "mt-5"}`}>
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
            </div>
            <div className="flex flex-wrap gap-2">
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
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black uppercase text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
                onClick={exportExcel}
                type="button"
              >
                <Download className="size-4" />
                Export Excel
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-950/10 bg-white">
            <div className={`${isMaximized ? "max-h-[calc(100vh-82px)]" : "max-h-[calc(100vh-285px)]"} overflow-auto`}>
              <table
                className="table-fixed border-separate border-spacing-0 text-left text-[11px]"
                style={{ minWidth: tableWidth, width: tableWidth }}
              >
                <colgroup>
                  <col style={{ width: columnWidth(actionColumnKey) }} />
                  {columns.map((column) => (
                    <col key={column.key} style={{ width: columnWidth(column.key) }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                  <tr>
                    <th
                      className="relative border-b border-r border-white/15 px-2 py-2 align-bottom font-black"
                      rowSpan={2}
                    >
                      Row
                      <ResizeHandle columnKey={actionColumnKey} onResizeStart={startColumnResize} />
                    </th>
                    {baseColumns.map((column) => (
                      <th
                        className="relative border-b border-r border-white/15 px-2 py-2 align-bottom font-black"
                        key={column.key}
                        rowSpan={2}
                      >
                        {column.label}
                        <ResizeHandle columnKey={column.key} onResizeStart={startColumnResize} />
                      </th>
                    ))}
                    {groupedColumns.map((group) => (
                      <th
                        className="border-b border-r border-white/15 px-2 py-2 text-center font-black"
                        colSpan={group.columns.length}
                        key={group.label}
                      >
                        {group.label}
                      </th>
                    ))}
                    {finalColumns.map((column) => (
                      <th
                        className="relative border-b border-r border-white/15 px-2 py-2 align-bottom font-black"
                        key={column.key}
                        rowSpan={2}
                      >
                        {column.label}
                        <ResizeHandle columnKey={column.key} onResizeStart={startColumnResize} />
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {demandColumns.map((column) => (
                      <th
                        className="relative border-b border-r border-white/15 px-2 py-2 text-center font-black"
                        key={column.key}
                      >
                        {column.label}
                        <ResizeHandle columnKey={column.key} onResizeStart={startColumnResize} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white shadow-[inset_0_-1px_0_rgba(15,23,42,0.10)]">
                    <td className="h-8 border-b border-r border-slate-200 bg-white px-1.5 py-1">
                      <button
                        className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 text-[10px] font-black uppercase text-teal-800 transition hover:bg-teal-100"
                        onClick={openNewEditor}
                        type="button"
                      >
                        <Plus className="size-3" />
                        Add
                      </button>
                    </td>
                    {columns.map((column) => (
                      <td
                        className="h-8 border-b border-r border-slate-200 bg-white px-1.5 py-1"
                        key={`filter-${column.key}`}
                      >
                        <input
                          aria-label={`Filter ${column.label}`}
                          className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-100"
                          onChange={(event) =>
                            setFilters((currentFilters) => ({
                              ...currentFilters,
                              [column.key]: event.target.value
                            }))
                          }
                          placeholder="Filter"
                          value={filters[column.key] ?? ""}
                        />
                      </td>
                    ))}
                  </tr>
                  {filteredRows.map(({ row, originalIndex }, visibleIndex) => (
                    <tr className="odd:bg-white even:bg-slate-50/80" key={row.id ?? originalIndex}>
                      <td className="h-8 whitespace-nowrap border-b border-r border-slate-200 px-1.5 py-1">
                        <div className="flex items-center gap-1">
                          <button
                            aria-label={`Edit row ${row.data.Sno || visibleIndex + 1}`}
                            className="inline-flex size-7 items-center justify-center rounded-md border border-sky-200 bg-white text-sky-700 transition hover:bg-sky-50"
                            onClick={() => openEditor(originalIndex, row)}
                            title="Edit row"
                            type="button"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            aria-label={`Delete row ${row.data.Sno || visibleIndex + 1}`}
                            className="inline-flex size-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 transition hover:bg-rose-50"
                            onClick={() => deleteRow(originalIndex)}
                            title="Delete row"
                            type="button"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                      {columns.map((column) => (
                        <td
                          className="h-8 border-b border-r border-slate-200 px-1.5 py-1 font-semibold text-slate-700"
                          key={`${originalIndex}-${column.key}`}
                        >
                          {column.key === "Sno" ? (
                            row.data[column.key] || visibleIndex + 1
                          ) : (
                            <span className="block w-full min-w-0 truncate px-1.5" title={String(row.data[column.key] ?? "")}>
                              {row.data[column.key] ?? ""}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
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
          <aside className="relative h-full w-full max-w-3xl overflow-y-auto border-l border-slate-950/10 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">GSTAT row editor</p>
                  <h3 className="mt-1 text-2xl font-black text-slate-950">Appeal {editor.draft.Sno || editor.rowIndex + 1}</h3>
                </div>
                <button
                  className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setEditor(null)}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-950/10 bg-white px-4 text-xs font-black uppercase text-slate-700 shadow-sm"
                  onClick={() => setEditor(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-slate-800"
                  onClick={saveEditor}
                  type="button"
                >
                  Save Row
                </button>
              </div>
            </div>
            <div className="space-y-5 p-5">
              {editorSections.map((section) => (
                <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4" key={section.title}>
                  <h4 className="text-sm font-black uppercase tracking-[0.12em] text-slate-600">{section.title}</h4>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {section.fields.map((field) => (
                      <label className="block" key={field}>
                        <span className="text-[11px] font-black uppercase text-slate-500">{field}</span>
                        <input
                          className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                          onChange={(event) => updateDraft(field, event.target.value)}
                          value={editor.draft[field] ?? ""}
                        />
                      </label>
                    ))}
                  </div>
                  {section.title === "Demand and deposit" ? (
                    <div className="mt-5 space-y-4">
                      {demandEditorGroups.map((group) => (
                        <div key={group.title}>
                          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                            {group.title}
                          </p>
                          <div className="mt-2 grid gap-3 sm:grid-cols-3">
                            {group.fields.map((field) => (
                              <label className="block" key={field}>
                                <span className="text-[11px] font-black uppercase text-slate-500">
                                  {field.split(" - ").pop()}
                                </span>
                                <input
                                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
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

function normalizeRows(rows: AppealRow[]) {
  return rows.map((row, index) => normalizeRow(row, index));
}

function normalizeRow(row: AppealRow, index: number): AppealRow {
  const rowNumber = row.row_number ?? index + 1;

  return {
    ...row,
    data: columns.reduce<RowData>((data, column) => {
      data[column.key] = column.key === "Sno" ? row.data?.[column.key] || rowNumber : row.data?.[column.key] ?? "";
      return data;
    }, {}),
    row_number: rowNumber
  };
}

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

function ResizeHandle({
  columnKey,
  onResizeStart
}: {
  columnKey: string;
  onResizeStart: (columnKey: string, event: ReactPointerEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      aria-hidden="true"
      className="absolute right-0 top-0 z-20 h-full w-3 cursor-col-resize touch-none bg-white/0 transition hover:bg-teal-300/80"
      onPointerDown={(event) => onResizeStart(columnKey, event)}
    />
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
