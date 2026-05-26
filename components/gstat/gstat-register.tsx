"use client";

import { ArrowLeft, Download, FileSpreadsheet, Scale, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Column = { group?: string; key: string; label: string };
type RowData = Record<string, string | number>;

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

const initialRows = Array.from({ length: 12 }, (_, index) =>
  columns.reduce<RowData>((row, column) => {
    row[column.key] = column.key === "Sno" ? index + 1 : "";
    return row;
  }, {})
);

export function GstatRegister() {
  const [rows, setRows] = useState<RowData[]>(initialRows);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uniqueAppeals = useMemo(
    () => rows.filter((row) => Object.values(row).some((value) => String(value).trim())).length,
    [rows]
  );

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
      columns.map((column) => (column.key === "Sno" ? row[column.key] || index + 1 : row[column.key] ?? ""))
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

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Array<string | number>>(worksheet, {
      blankrows: false,
      defval: "",
      header: 1
    });
    const dataStartIndex = findDataStart(rawRows);
    const nextRows = rawRows.slice(dataStartIndex).map((rawRow, rowIndex) =>
      columns.reduce<RowData>((row, column, columnIndex) => {
        row[column.key] = column.key === "Sno" ? rawRow[columnIndex] || rowIndex + 1 : rawRow[columnIndex] ?? "";
        return row;
      }, {})
    );

    setRows(nextRows.length ? nextRows : initialRows);
    setMessage(`${nextRows.length} row${nextRows.length === 1 ? "" : "s"} imported from ${file.name}.`);
    event.target.value = "";
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f3ea] px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(20,184,166,0.18),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(217,70,239,0.16),transparent_26%),radial-gradient(circle_at_48%_92%,rgba(245,158,11,0.16),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <section className="mx-auto max-w-[1680px]">
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

        <section className="workline-frame mt-5 rounded-[28px] p-3 md:p-4">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">Appeals Register</h2>
              {message ? <p className="mt-1 text-sm font-bold text-emerald-700">{message}</p> : null}
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Upload className="size-4" />
                Import Excel
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
                onClick={exportExcel}
                type="button"
              >
                <Download className="size-4" />
                Export Excel
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-950/10 bg-white">
            <div className="max-h-[calc(100vh-285px)] overflow-auto">
              <table className="min-w-[4200px] border-separate border-spacing-0 text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                  <tr>
                    {baseColumns.map((column) => (
                      <th
                        className="border-b border-r border-white/15 px-3 py-3 align-bottom font-black"
                        key={column.key}
                        rowSpan={2}
                      >
                        {column.label}
                      </th>
                    ))}
                    {groupedColumns.map((group) => (
                      <th
                        className="border-b border-r border-white/15 px-3 py-3 text-center font-black"
                        colSpan={group.columns.length}
                        key={group.label}
                      >
                        {group.label}
                      </th>
                    ))}
                    {finalColumns.map((column) => (
                      <th
                        className="border-b border-r border-white/15 px-3 py-3 align-bottom font-black"
                        key={column.key}
                        rowSpan={2}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {demandColumns.map((column) => (
                      <th
                        className="border-b border-r border-white/15 px-3 py-3 text-center font-black"
                        key={column.key}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr className="odd:bg-white even:bg-slate-50/80" key={rowIndex}>
                      {columns.map((column) => (
                        <td
                          className="h-12 border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700"
                          key={`${rowIndex}-${column.key}`}
                        >
                          {column.key === "Sno" ? row[column.key] || rowIndex + 1 : row[column.key]}
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
    </main>
  );
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

function findDataStart(rawRows: Array<Array<string | number>>) {
  const firstRowText = rawRows[0]?.map(String).join(" ").toLowerCase() ?? "";
  const secondRowText = rawRows[1]?.map(String).join(" ").toLowerCase() ?? "";

  if (firstRowText.includes("sno") && secondRowText.includes("igst")) {
    return 2;
  }

  if (firstRowText.includes("sno")) {
    return 1;
  }

  return 0;
}
