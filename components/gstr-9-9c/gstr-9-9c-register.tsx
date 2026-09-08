"use client";

import { FileSpreadsheet, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

type CellValue = string | number | boolean;
type WorkbookSheet = { columns: string[]; name: string; rows: CellValue[][] };
export type GstrWorkbookData = { sheets: WorkbookSheet[]; sourceFile: string; title: string };

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

export function GstrNineNineCRegister({ workbook }: { workbook: GstrWorkbookData }) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [search, setSearch] = useState("");
  const activeSheet = workbook.sheets[activeSheetIndex] ?? workbook.sheets[0];
  const query = search.trim().toLowerCase();
  const rows = useMemo(
    () => activeSheet.rows.filter((row) => !query || row.some((value) => cellText(value).toLowerCase().includes(query))),
    [activeSheet, query]
  );
  const totalWidth = activeSheet.columns.reduce((total, column) => total + columnWidth(column), 0);

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
            {rows.length.toLocaleString("en-IN")} rows
          </span>
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
            onClick={() => {
              setActiveSheetIndex(index);
              setSearch("");
            }}
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
                  className={`border-b border-r border-slate-200 px-3 py-3 font-black uppercase tracking-wide ${columnIndex === 0 ? "sticky left-0 z-30 bg-slate-100" : ""}`}
                  key={column}
                >
                  {column}
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
