"use client";

import { Download, ExternalLink, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { getCached, setCached } from "@/lib/data-cache";

type RegisterRow = Record<string, string | number>;
type EditorState = { row: RegisterRow; rowId?: string };

const displayColumns = [
  "S.No.",
  "Client / Entity",
  "Service / Scope",
  "Period",
  "Engagement Date",
  "Fee",
  "Zoho Drive Link",
  "Billed Status",
  "Remarks"
];

const editableFields: { key: string; type: "date" | "number" | "select" | "text" | "textarea" | "url"; options?: string[]; wide?: boolean }[] = [
  { key: "Client / Entity", type: "text" },
  { key: "Service / Scope", type: "text" },
  { key: "Period", type: "text" },
  { key: "Engagement Date", type: "date" },
  { key: "Fee", type: "number" },
  { key: "Zoho Drive Link", type: "url", wide: true },
  { key: "Billed Status", type: "select", options: ["Unbilled", "Billed"] },
  { key: "Remarks", type: "textarea", wide: true }
];

export function EngagementLettersRegister() {
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    void loadRows();
  }, []);

  async function loadRows() {
    if (!hydratedRef.current) {
      const cached = getCached<RegisterRow[]>("engagement-letters");
      if (cached) {
        setRows(cached);
        setIsLoading(false);
      }
      hydratedRef.current = true;
    }
    try {
      const response = await fetch("/api/engagement-letters/managed", { cache: "no-store" });
      const result = (await response.json()) as { error?: string; rows?: RegisterRow[] };
      if (!response.ok) {
        setMessage(result.error ?? "Could not load engagement letters.");
        return;
      }
      setRows(result.rows ?? []);
      setCached("engagement-letters", result.rows ?? []);
      setMessage("");
    } catch {
      setMessage("Could not load engagement letters.");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((row) => displayColumns.some((column) => String(row[column] ?? "").toLowerCase().includes(query)));
  }, [rows, search]);

  function openAdd() {
    const blank = displayColumns.reduce<RegisterRow>((row, column) => {
      row[column] = "";
      return row;
    }, {});
    blank["Billed Status"] = "Unbilled";
    setEditor({ row: blank });
  }

  function openEdit(row: RegisterRow) {
    setEditor({ row: { ...row }, rowId: String(row.id) });
  }

  async function saveEditor() {
    if (!editor) {
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/engagement-letters/managed", {
        body: JSON.stringify({ action: editor.rowId ? "update" : "add", row: editor.row, rowId: editor.rowId }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { error?: string; rows?: RegisterRow[] };
      if (!response.ok) {
        setMessage(result.error ?? "Could not save engagement letter.");
        return;
      }
      setRows(result.rows ?? []);
      setCached("engagement-letters", result.rows ?? []);
      setEditor(null);
      setMessage(editor.rowId ? "Engagement letter updated." : "Engagement letter added.");
    } catch {
      setMessage("Could not save engagement letter.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRow(row: RegisterRow) {
    if (!window.confirm(`Delete engagement letter for ${row["Client / Entity"] || "this entry"}?`)) {
      return;
    }
    const response = await fetch("/api/engagement-letters/managed", {
      body: JSON.stringify({ action: "delete", rowId: String(row.id) }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { error?: string; rows?: RegisterRow[] };
    if (!response.ok) {
      setMessage(result.error ?? "Could not delete engagement letter.");
      return;
    }
    setRows(result.rows ?? []);
    setCached("engagement-letters", result.rows ?? []);
    setMessage("Engagement letter deleted.");
  }

  function exportExcel() {
    const data = filteredRows.map((row, index) =>
      displayColumns.reduce<Record<string, string | number>>((record, column) => {
        record[column] = column === "S.No." ? index + 1 : row[column] ?? "";
        return record;
      }, {})
    );
    const worksheet = XLSX.utils.json_to_sheet(data, { header: displayColumns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Engagement Letters");
    XLSX.writeFile(workbook, "workline-engagement-letters.xlsx");
  }

  return (
    <section className="w-full rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="shrink-0">
          <h2 className="text-xl font-black text-slate-950">Engagement Letters</h2>
          <p className="text-xs font-bold text-slate-500">
            {isLoading ? "Loading..." : `${filteredRows.length} of ${rows.length} letters`}
          </p>
        </div>
        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search className="size-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search client, service, period, status"
            value={search}
          />
        </label>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
          onClick={exportExcel}
          type="button"
        >
          <Download className="size-4" />
          Export Excel
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md bg-navy-700 px-4 text-sm font-black text-white transition hover:bg-navy-800"
          onClick={openAdd}
          type="button"
        >
          <Plus className="size-4" />
          Add letter
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">{message}</p>
      ) : null}

      <div className="mt-4 max-h-[calc(100vh-220px)] overflow-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
            <tr>
              {displayColumns.map((column) => (
                <th className="px-3 py-2" key={column}>{column}</th>
              ))}
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={displayColumns.length + 1}>Loading engagement letters...</td></tr>
            ) : filteredRows.length ? filteredRows.map((row, index) => (
              <tr className="border-b border-slate-100 last:border-b-0" key={String(row.id)}>
                {displayColumns.map((column) => (
                  <td className="px-3 py-2 align-top" key={column}>
                    {column === "S.No." ? (
                      <span className="font-bold text-slate-600">{index + 1}</span>
                    ) : column === "Zoho Drive Link" ? (
                      row[column] ? (
                        <a
                          className="inline-flex items-center gap-1 font-bold text-navy-700 hover:underline"
                          href={String(row[column])}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLink className="size-3.5" />
                          Open
                        </a>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )
                    ) : column === "Billed Status" ? (
                      row[column] ? (
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                            String(row[column]).toLowerCase() === "billed"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {row[column]}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )
                    ) : (
                      <span className="font-semibold text-slate-700">{row[column] || <span className="text-slate-300">-</span>}</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 align-top">
                  <div className="flex items-center gap-1">
                    <button className="inline-flex size-8 items-center justify-center rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => openEdit(row)} title="Edit" type="button">
                      <Pencil className="size-4" />
                    </button>
                    <button className="inline-flex size-8 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => deleteRow(row)} title="Delete" type="button">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={displayColumns.length + 1}>No engagement letters yet. Click &ldquo;Add letter&rdquo; to start.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editor ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-700/45 px-4 py-6">
          <section className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.30)]">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <h3 className="text-xl font-black text-slate-950">{editor.rowId ? "Edit engagement letter" : "New engagement letter"}</h3>
              <button className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setEditor(null)} type="button">
                <X className="size-4" />
              </button>
            </header>
            <div className="max-h-[70vh] overflow-auto p-5">
              <div className="grid gap-3 md:grid-cols-2">
                {editableFields.map((field) => (
                  <label className={field.wide ? "md:col-span-2" : ""} key={field.key}>
                    <span className="text-[10px] font-black uppercase text-slate-500">{field.key}</span>
                    {field.type === "select" ? (
                      <select
                        className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-navy-400"
                        onChange={(event) => setEditor((current) => (current ? { ...current, row: { ...current.row, [field.key]: event.target.value } } : current))}
                        value={String(editor.row[field.key] ?? "")}
                      >
                        {(field.options ?? []).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold outline-none focus:border-navy-400"
                        onChange={(event) => setEditor((current) => (current ? { ...current, row: { ...current.row, [field.key]: event.target.value } } : current))}
                        rows={2}
                        value={String(editor.row[field.key] ?? "")}
                      />
                    ) : (
                      <input
                        className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-navy-400"
                        onChange={(event) => setEditor((current) => (current ? { ...current, row: { ...current.row, [field.key]: event.target.value } } : current))}
                        placeholder={field.type === "url" ? "https://workdrive.zoho.in/..." : field.type === "date" ? "dd-mm-yyyy" : undefined}
                        type={field.type === "number" ? "number" : "text"}
                        value={String(editor.row[field.key] ?? "")}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50" onClick={() => setEditor(null)} type="button">Cancel</button>
              <button className="inline-flex h-10 items-center rounded-md bg-navy-700 px-5 text-sm font-black text-white transition hover:bg-navy-800 disabled:opacity-50" disabled={isSaving} onClick={saveEditor} type="button">
                {isSaving ? "Saving..." : "Save"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
