"use client";

import { Download, Upload } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";

type RegisterRow = Record<string, string | number>;

type SpreadsheetRegisterProps = {
  columns: string[];
  emptyMessage: string;
  filename: string;
  minWidth: number;
  title: string;
  tone?: string;
};

export function SpreadsheetRegister({
  columns,
  emptyMessage,
  filename,
  minWidth,
  title,
  tone = "text-slate-700"
}: SpreadsheetRegisterProps) {
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        columns.every((column) => row.map((value) => String(value).trim()).includes(column))
      );
      const dataRows = rawRows
        .slice(headerIndex >= 0 ? headerIndex + 1 : 1)
        .filter((row) => row.some((value) => String(value).trim()))
        .map((row) =>
          columns.reduce<RegisterRow>((record, column, index) => {
            record[column] = row[index] ?? "";
            return record;
          }, {})
        );

      setRows(dataRows);
      setMessage(dataRows.length ? `Imported ${dataRows.length} rows from ${file.name}.` : "No rows found in the selected Excel file.");
    } catch (error) {
      console.error(`${title} import error:`, error);
      setMessage("Could not import the selected Excel file.");
    } finally {
      event.target.value = "";
    }
  }

  function exportExcel() {
    const exportRows = rows.length ? rows : [createBlankRow(columns)];
    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: columns });
    worksheet["!cols"] = columns.map((column) => ({ wch: Math.max(14, column.length + 3) }));
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({ e: { c: columns.length - 1, r: Math.max(rows.length, 1) }, s: { c: 0, r: 0 } })
    };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31));
    XLSX.writeFile(workbook, filename);
    setMessage(rows.length ? `Exported ${rows.length} rows.` : "Exported a blank template.");
  }

  return (
    <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className={`text-xs font-black uppercase tracking-[0.16em] ${tone}`}>Register</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">{title}</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">
            {columns.length} columns - {rows.length} rows
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
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload className="size-4" />
            Import Excel
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
            onClick={exportExcel}
            type="button"
          >
            <Download className="size-4" />
            Export Excel
          </button>
        </div>
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          {message}
        </p>
      ) : null}

      <div className="mt-5 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              {columns.map((column) => (
                <th className="border-b border-r border-slate-200 px-4 py-3 last:border-r-0" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr className="border-b border-slate-100 last:border-b-0" key={`${title}-${rowIndex}`}>
                  {columns.map((column) => (
                    <td className="border-r border-slate-100 px-4 py-3 font-semibold text-slate-700 last:border-r-0" key={column}>
                      {row[column] || "-"}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-sm font-bold text-slate-500" colSpan={columns.length}>
                  {emptyMessage}
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
    row[column] = "";
    return row;
  }, {});
}
