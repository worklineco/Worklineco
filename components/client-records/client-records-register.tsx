"use client";

import {
  ArrowDown,
  ArrowUp,
  Download,
  Edit3,
  Filter,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getCached, setCached } from "@/lib/data-cache";
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
  "PAN/IT No."
];
const importActionColumn = "Import Action";
const importActionOptions = ["Add", "Update", "Delete"];
const maxDeleteRows = 5;
const buttonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50";

export function ClientRecordsRegister() {
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [trashRows, setTrashRows] = useState<RegisterRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterColumn, setFilterColumn] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortState, setSortState] = useState<SortState>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dataHydratedRef = useRef(false);

  useEffect(() => {
    void loadRows();
  }, []);

  const visibleRows = useMemo<RegisterRow[]>(() => withSerial(rows), [rows]);
  const filteredRows = useMemo<RegisterRow[]>(() => {
    const searchValue = search.trim().toLowerCase();
    const filter = filterValue.trim().toLowerCase();
    let nextRows = visibleRows.filter((row) => {
      const matchesSearch =
        !searchValue ||
        columns.some((column) => String(row[column] ?? "").toLowerCase().includes(searchValue));
      const matchesFilter =
        !filterColumn ||
        !filter ||
        String(row[filterColumn] ?? "").toLowerCase().includes(filter);

      return matchesSearch && matchesFilter;
    });

    if (sortState) {
      nextRows = [...nextRows].sort((first, second) => {
        const left = String(first[sortState.column] ?? "");
        const right = String(second[sortState.column] ?? "");
        return sortState.direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
      });
    }

    return nextRows;
  }, [filterColumn, filterValue, search, sortState, visibleRows]);
  const selectedVisibleCount = filteredRows.filter((row) => selectedIds.has(String(row.id))).length;
  const areAllVisibleSelected = filteredRows.length > 0 && selectedVisibleCount === filteredRows.length;

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

    setCached("client-records", { auditLogs: result.auditLogs, rows: result.rows, trashRows: result.trashRows });
    setRows(result.rows ?? []);
    setTrashRows(result.trashRows ?? []);
    setAuditLogs(result.auditLogs ?? []);
    setSelectedIds(new Set());
    setMessage("");
    setIsLoading(false);
  }

  async function saveAction(body: Record<string, unknown>, successMessage: string) {
    const response = await fetch("/api/client-records/managed", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as {
      auditLogs?: AuditLog[];
      error?: string;
      rows?: RegisterRow[];
      trashRows?: RegisterRow[];
    };

    if (!response.ok) {
      setMessage(result.error ?? "Could not save client records.");
      return false;
    }

    setRows(result.rows ?? []);
    setTrashRows(result.trashRows ?? []);
    setAuditLogs(result.auditLogs ?? []);
    setSelectedIds(new Set());
    setMessage(successMessage);
    return true;
  }

  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Array<string | number>>(worksheet, {
        blankrows: false,
        defval: "",
        header: 1
      });
      const importColumns = columns.filter((column) => column !== "S.no.");
      const headerIndex = rawRows.findIndex((row) =>
        importColumns.every((column) => row.map((value) => String(value).trim()).includes(column))
      );
      const headerRow = headerIndex >= 0 ? rawRows[headerIndex].map((value) => String(value).trim()) : [];
      const nextRows = rawRows
        .slice(headerIndex >= 0 ? headerIndex + 1 : 1)
        .filter((row) => row.some((value) => String(value).trim()))
        .map((row, rowIndex) =>
          [importActionColumn, ...columns].reduce<RegisterRow>((record, column, columnIndex) => {
            if (column === importActionColumn) {
              const sourceIndex = headerRow.findIndex((header) => normalizeHeader(header) === normalizeHeader(importActionColumn));
              record[column] = normalizeImportAction(row[sourceIndex >= 0 ? sourceIndex : 0]);
              return record;
            }

            if (column === "S.no.") {
              record[column] = rowIndex + 1;
              return record;
            }

            const sourceIndex = headerRow.length
              ? headerRow.findIndex((header) => header === column)
              : importColumns.findIndex((header) => header === column);
            record[column] = row[sourceIndex >= 0 ? sourceIndex : columnIndex] ?? "";
            return record;
          }, {})
        );

      await saveAction({ action: "import", rows: nextRows }, `Processed ${nextRows.length} client record import rows.`);
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

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (areAllVisibleSelected) {
        filteredRows.forEach((row) => next.delete(String(row.id)));
      } else {
        filteredRows.forEach((row) => next.add(String(row.id)));
      }

      return next;
    });
  }

  async function deleteSelectedRows() {
    const ids = Array.from(selectedIds);

    if (!ids.length) {
      setMessage("Select client records to delete.");
      return;
    }

    if (ids.length > maxDeleteRows) {
      setMessage(`You can delete at most ${maxDeleteRows} client records at once.`);
      return;
    }

    if (!window.confirm(`Move ${ids.length} client record(s) to trash?`)) return;

    await saveAction({ action: "delete", rowIds: ids }, `Moved ${ids.length} client record(s) to trash.`);
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
    <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Register</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Client Records</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">
            {columns.length} columns - {isLoading ? "loading" : rows.length} rows
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input accept=".csv,.xls,.xlsx" className="hidden" onChange={importExcel} ref={fileInputRef} type="file" />
          <button className={buttonClass} onClick={() => fileInputRef.current?.click()} type="button">
            <Upload className="size-4" />
            Import Excel
          </button>
          <button className={buttonClass} onClick={exportExcel} type="button">
            <Download className="size-4" />
            Export Excel
          </button>
          <button className={buttonClass} onClick={() => setIsFilterOpen((current) => !current)} type="button">
            <Filter className="size-4" />
            Filter
          </button>
          <button className={buttonClass} onClick={() => setSortState(null)} type="button">
            {sortState?.direction === "desc" ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
            Sort
          </button>
          <button className={`${buttonClass} bg-emerald-50 text-emerald-800 ring-emerald-200`} onClick={() => setEditor({ row: createBlankRow() })} type="button">
            <Plus className="size-4" />
            Add
          </button>
          <button className={`${buttonClass} bg-rose-50 text-rose-800 ring-rose-200`} onClick={deleteSelectedRows} type="button">
            <Trash2 className="size-4" />
            Delete
          </button>
          <button className={buttonClass} onClick={() => setIsTrashOpen((current) => !current)} type="button">
            <Trash2 className="size-4" />
            Trash
          </button>
          <button className={buttonClass} onClick={() => setIsAuditOpen((current) => !current)} type="button">
            <History className="size-4" />
            Audit
          </button>
          <button className={`${buttonClass} bg-navy-700 text-white ring-slate-950`} onClick={loadRows} type="button">
            <RefreshCw className="size-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
        <Search className="size-4 text-slate-400" />
        <input
          className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Universal search"
          value={search}
        />
      </div>

      {isFilterOpen ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[240px_1fr_auto]">
          <select className="input" onChange={(event) => setFilterColumn(event.target.value)} value={filterColumn}>
            <option value="">Filter column</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
          <input className="input" onChange={(event) => setFilterValue(event.target.value)} placeholder="Filter value" value={filterValue} />
          <button className={buttonClass} onClick={() => { setFilterColumn(""); setFilterValue(""); }} type="button">
            <X className="size-4" />
            Clear
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          {message}
        </p>
      ) : null}

      <div className="mt-5 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1780px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
            <tr>
              <th className="border-b border-r border-slate-200 px-4 py-3">
                <input checked={areAllVisibleSelected} onChange={toggleVisibleSelection} type="checkbox" />
              </th>
              <th className="border-b border-r border-slate-200 px-4 py-3">Actions</th>
              {columns.map((column) => (
                <th className="border-b border-r border-slate-200 px-4 py-3" key={column}>
                  <button className="inline-flex items-center gap-1" onClick={() => toggleSort(column)} type="button">
                    {column}
                    {sortState?.column === column ? (
                      sortState.direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-8 text-sm font-bold text-slate-500" colSpan={columns.length + 2}>
                  Loading client records...
                </td>
              </tr>
            ) : filteredRows.length ? (
              filteredRows.map((row) => (
                <tr className="border-b border-slate-100 last:border-b-0" key={String(row.id)}>
                  <td className="border-r border-slate-100 px-4 py-3">
                    <input
                      checked={selectedIds.has(String(row.id))}
                      onChange={() =>
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          const id = String(row.id);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                      type="checkbox"
                    />
                  </td>
                  <td className="border-r border-slate-100 px-4 py-3">
                    <button className={`${buttonClass} h-9 px-3`} onClick={() => setEditor({ row: stripInternalFields(row), rowId: String(row.id) })} type="button">
                      <Edit3 className="size-3.5" />
                      Edit
                    </button>
                  </td>
                  {columns.map((column) => (
                    <td className="border-r border-slate-100 px-4 py-3 font-semibold text-slate-700" key={column}>
                      {row[column] || "-"}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-sm font-bold text-slate-500" colSpan={columns.length + 2}>
                  No client records found.
                </td>
              </tr>
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
                  <input
                    className="input mt-2"
                    onChange={(event) =>
                      setEditor((current) =>
                        current ? { ...current, row: { ...current.row, [column]: event.target.value } } : current
                      )
                    }
                    value={String(editor.row[column] ?? "")}
                  />
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

function normalizeHeader(value: st