"use client";

import { Download, Plus, Search, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { getCached, setCached } from "@/lib/data-cache";

type RegisterRow = Record<string, string | number>;
const importActionColumn = "Import Action";
const importActionOptions = ["Add", "Update", "Delete"];

type SpreadsheetRegisterProps = {
  apiPath?: string;
  autoSerialColumn?: string;
  columns: string[];
  emptyMessage: string;
  enableSearch?: boolean;
  filename: string;
  minWidth: number;
  pocConfig?: {
    clientColumn: string;
    contactColumn: string;
    emailColumn: string;
    nameColumn: string;
  };
  title: string;
  tone?: string;
};

export function SpreadsheetRegister({
  apiPath,
  autoSerialColumn,
  columns,
  emptyMessage,
  enableSearch = false,
  filename,
  minWidth,
  pocConfig,
  title,
  tone = "text-slate-700"
}: SpreadsheetRegisterProps) {
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(apiPath));
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [pocClient, setPocClient] = useState("");
  const [pocContact, setPocContact] = useState("");
  const [pocEmail, setPocEmail] = useState("");
  const [pocName, setPocName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visibleRows = useMemo(() => withAutoSerial(rows, autoSerialColumn), [autoSerialColumn, rows]);
  const filteredRows = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return visibleRows;
    }

    return visibleRows.filter((row) =>
      columns.some((column) => String(row[column] ?? "").toLowerCase().includes(value))
    );
  }, [columns, search, visibleRows]);
  const pocClients = useMemo(() => {
    if (!pocConfig) {
      return [];
    }

    return Array.from(
      new Set(
        rows
          .map((row) => String(row[pocConfig.clientColumn] ?? "").trim())
          .filter(Boolean)
      )
    );
  }, [pocConfig, rows]);

  useEffect(() => {
    if (!apiPath) {
      return;
    }

    const endpoint = apiPath;

    async function loadRows() {
      const cached = getCached<RegisterRow[]>(endpoint);

      if (cached) {
        setRows(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      setMessage("");

      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const result = (await response.json()) as { error?: string; rows?: RegisterRow[] };

        if (!response.ok) {
          setMessage(result.error ?? "Could not load saved rows.");
          if (!cached) {
            setRows([]);
          }
          return;
        }

        const nextRows = result.rows ?? [];
        setCached(endpoint, nextRows);
        setRows(nextRows);
      } catch (error) {
        console.error(`${title} load error:`, error);
        setMessage("Could not load saved rows.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadRows();
  }, [apiPath, title]);

  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Array<string | number>>(worksheet, {
        blankrows: false,
        defval: "",
        header: 1
      });
      const headerIndex = rawRows.findIndex((row) =>
        getImportColumns(columns, autoSerialColumn).every((column) =>
          row.map((value) => String(value).trim()).includes(column)
        )
      );
      const headerRow = headerIndex >= 0 ? rawRows[headerIndex].map((value) => String(value).trim()) : [];
      const dataRows = rawRows
        .slice(headerIndex >= 0 ? headerIndex + 1 : 1)
        .filter((row) => row.some((value) => String(value).trim()))
        .map((row, rowIndex) =>
          [importActionColumn, ...columns].reduce<RegisterRow>((record, column, columnIndex) => {
            if (column === importActionColumn) {
              const sourceIndex = headerRow.findIndex((header) => normalizeHeader(header) === normalizeHeader(importActionColumn));
              record[column] = normalizeImportAction(row[sourceIndex >= 0 ? sourceIndex : 0]);
              return record;
            }

            if (column === autoSerialColumn) {
              record[column] = rowIndex + 1;
              return record;
            }

            const sourceIndex = headerRow.length
              ? headerRow.findIndex((header) => header === column)
              : getImportColumns(columns, autoSerialColumn).findIndex((header) => header === column);
            record[column] = row[sourceIndex >= 0 ? sourceIndex : columnIndex] ?? "";
            return record;
          }, {})
        );
      const nextRows = applyImportActions(rows, dataRows, autoSerialColumn);

      if (apiPath && dataRows.length) {
        await saveRows(nextRows, `Processed and saved ${dataRows.length} import rows from ${file.name}.`);
      } else {
        setRows(nextRows);
        setMessage(dataRows.length ? `Processed ${dataRows.length} import rows from ${file.name}.` : "No rows found in the selected Excel file.");
      }
    } catch (error) {
      console.error(`${title} import error:`, error);
      setMessage("Could not import the selected Excel file.");
    } finally {
      event.target.value = "";
    }
  }

  async function saveRows(nextRows: RegisterRow[], successMessage: string) {
    setIsSaving(true);

    try {
      const response = await fetch(apiPath!, {
        body: JSON.stringify({ rows: nextRows }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { error?: string; rows?: RegisterRow[] };

      if (!response.ok) {
        setMessage(result.error ?? "Could not save rows.");
        return;
      }

      setRows(result.rows ?? nextRows);
      setMessage(successMessage);
    } catch (error) {
      console.error(`${title} save error:`, error);
      setMessage("Could not save rows.");
    } finally {
      setIsSaving(false);
    }
  }

  function exportExcel() {
    const exportColumns = [importActionColumn, ...columns];
    const exportRows = visibleRows.length
      ? visibleRows.map((row) => ({ [importActionColumn]: "Update", ...row }))
      : [createBlankRow(exportColumns)];
    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: exportColumns });
    worksheet["!cols"] = exportColumns.map((column) => ({ wch: Math.max(14, column.length + 3) }));
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({ e: { c: exportColumns.length - 1, r: Math.max(visibleRows.length, 1) }, s: { c: 0, r: 0 } })
    };
    addImportActionDropdown(worksheet, Math.max(exportRows.length + 100, 500));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31));
    XLSX.writeFile(workbook, filename);
    setMessage(rows.length ? `Exported ${rows.length} rows.` : "Exported a blank template.");
  }

  function addPoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pocConfig || !pocClient.trim() || !pocName.trim()) {
      setMessage("Select a client and enter POC name.");
      return;
    }

    const matchingRow = rows.find(
      (row) => String(row[pocConfig.clientColumn] ?? "").trim().toLowerCase() === pocClient.trim().toLowerCase()
    );
    const nextRow = columns.reduce<RegisterRow>((record, column) => {
      if (column === autoSerialColumn) {
        record[column] = rows.length + 1;
      } else if (column === pocConfig.clientColumn) {
        record[column] = pocClient.trim();
      } else if (column === pocConfig.nameColumn) {
        record[column] = pocName.trim();
      } else if (column === pocConfig.contactColumn) {
        record[column] = pocContact.trim();
      } else if (column === pocConfig.emailColumn) {
        record[column] = pocEmail.trim();
      } else {
        record[column] = matchingRow?.[column] ?? "";
      }

      return record;
    }, {});

    setRows((currentRows) => [...currentRows, nextRow]);
    setPocContact("");
    setPocEmail("");
    setPocName("");
    setMessage(`Added POC for ${pocClient.trim()}.`);
  }

  return (
    <section className="workline-frame rounded-2xl p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${tone}`}>Register</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">
            {columns.length} columns - {isLoading ? "loading" : rows.length} rows
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={importExcel}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50"
            disabled={isLoading || isSaving}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload className="size-4" />
            {isSaving ? "Saving..." : "Import Excel"}
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy-700 px-4 text-sm font-semibold text-white transition hover:bg-navy-800"
            onClick={exportExcel}
            type="button"
          >
            <Download className="size-4" />
            Export Excel
          </button>
        </div>
      </div>

      {enableSearch ? (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
          <Search className="size-4 text-slate-400" />
          <input
            className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
            value={search}
          />
        </div>
      ) : null}

      {pocConfig ? (
        <form className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_1fr_1fr_1fr_auto]" onSubmit={addPoc}>
          <input
            className="input"
            list={`${title}-clients`}
            onChange={(event) => setPocClient(event.target.value)}
            placeholder="Client"
            value={pocClient}
          />
          <datalist id={`${title}-clients`}>
            {pocClients.map((client) => (
              <option key={client} value={client} />
            ))}
          </datalist>
          <input className="input" onChange={(event) => setPocName(event.target.value)} placeholder="POC Name" value={pocName} />
          <input className="input" onChange={(event) => setPocContact(event.target.value)} placeholder="POC Contact no." value={pocContact} />
          <input className="input" onChange={(event) => setPocEmail(event.target.value)} placeholder="Email ID" value={pocEmail} />
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-lime-700 px-4 text-sm font-semibold text-white transition hover:bg-lime-800" type="submit">
            <Plus className="size-4" />
            Add POC
          </button>
        </form>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          {message}
        </p>
      ) : null}

      <div className="mt-5 max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
          <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              {columns.map((column) => (
                <th className="border-b border-slate-200 px-4 py-3 font-semibold" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-8 text-sm font-medium text-slate-500" colSpan={columns.length}>
                  Loading saved rows...
                </td>
              </tr>
            ) : filteredRows.length ? (
              filteredRows.map((row, rowIndex) => (
                <tr className="border-b border-slate-100 transition-colors last:border-b-0 even:bg-slate-50/40 hover:bg-navy-50/40" key={`${title}-${rowIndex}`}>
                  {columns.map((column) => (
                    <td className="px-4 py-2.5 font-medium text-slate-700" key={column}>
                      {row[column] || "-"}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-sm font-bold text-slate-500" colSpan={columns.length}>
                  {search.trim() ? "No matching rows found." : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function createBlankRow(columns: string[]) {
  return columns.reduce<RegisterRow>((row, column) => {
    row[column] = column === importActionColumn ? "Add" : "";
    return row;
  }, {});
}

function getImportColumns(columns: string[], autoSerialColumn?: string) {
  return autoSerialColumn ? columns.filter((column) => column !== autoSerialColumn) : columns;
}

function withAutoSerial(rows: RegisterRow[], autoSerialColumn?: string) {
  if (!autoSerialColumn) {
    return rows;
  }

  return rows.map((row, index) => ({
    ...row,
    [autoSerialColumn]: index + 1
  }));
}

function applyImportActions(
  currentRows: RegisterRow[],
  importedRows: RegisterRow[],
  autoSerialColumn?: string
) {
  const nextRows = [...currentRows];

  importedRows.forEach((importedRow, rowIndex) => {
    const action = normalizeImportAction(importedRow[importActionColumn]);
    const cleanRow = stripImportAction(importedRow);
    const targetIndex = findMatchingRowIndex(nextRows, cleanRow, rowIndex, autoSerialColumn);

    if (action === "Delete") {
      if (targetIndex >= 0) {
        nextRows.splice(targetIndex, 1);
      }
      return;
    }

    if (action === "Update") {
      if (targetIndex >= 0) {
        nextRows[targetIndex] = cleanRow;
      } else {
        nextRows.push(cleanRow);
      }
      return;
    }

    nextRows.push(cleanRow);
  });

  return nextRows;
}

function findMatchingRowIndex(
  rows: RegisterRow[],
  importedRow: RegisterRow,
  fallbackIndex: number,
  autoSerialColumn?: string
) {
  if (autoSerialColumn) {
    const importedSerial = String(importedRow[autoSerialColumn] ?? "").trim();

    if (importedSerial) {
      const matchedIndex = rows.findIndex((row) => String(row[autoSerialColumn] ?? "").trim() === importedSerial);

      if (matchedIndex >= 0) {
        return matchedIndex;
      }
    }
  }

  return fallbackIndex < rows.length ? fallbackIndex : -1;
}

function stripImportAction(row: RegisterRow) {
  const { [importActionColumn]: _action, ...cleanRow } = row;
  return cleanRow;
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

function normalizeHeader(value: string) {
  return value.replace(/[^0-9a-z]/gi, "").toLowerCase();
}

function addImportActionDropdown(worksheet: XLSX.WorkSheet, rowCount: number) {
