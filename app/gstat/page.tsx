import { ArrowLeft, FileSpreadsheet, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";

const baseColumns = [
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
];

const groupedColumns = [
  { columns: ["IGST", "CGST", "SGST"], label: "Tax Demand" },
  { columns: ["IGST", "CGST", "SGST"], label: "Penalty Demand" },
  { columns: ["IGST", "CGST", "SGST"], label: "Pre Deposit Amount" }
];

const finalColumns = ["Pre Deposit Workings"];
const emptyRows = Array.from({ length: 12 }, (_, index) => index + 1);

export default function GstatPage() {
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
                  <h1 className="mt-1 text-4xl font-black leading-tight text-slate-950">
                    GSTAT
                  </h1>
                </div>
              </div>
              <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Track appeal status, demand exposure, deposits, credentials,
                documents, and handling responsibility in one structured register.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric icon={FileSpreadsheet} label="Unique Appeals" value="97" />
              <Metric icon={ShieldCheck} label="Workspace" value="Protected" />
            </div>
          </div>
        </header>

        <section className="workline-frame mt-5 rounded-[28px] p-3 md:p-4">
          <div className="overflow-hidden rounded-2xl border border-slate-950/10 bg-white">
            <div className="max-h-[calc(100vh-230px)] overflow-auto">
              <table className="min-w-[4200px] border-separate border-spacing-0 text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                  <tr>
                    {baseColumns.map((column) => (
                      <th
                        className="border-b border-r border-white/15 px-3 py-3 align-bottom font-black"
                        key={column}
                        rowSpan={2}
                      >
                        {column}
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
                        key={column}
                        rowSpan={2}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {groupedColumns.flatMap((group) =>
                      group.columns.map((column) => (
                        <th
                          className="border-b border-r border-white/15 px-3 py-3 text-center font-black"
                          key={`${group.label}-${column}`}
                        >
                          {column}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {emptyRows.map((rowNumber) => (
                    <tr className="odd:bg-white even:bg-slate-50/80" key={rowNumber}>
                      {baseColumns.map((column) => (
                        <td
                          className="h-12 border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700"
                          key={`${rowNumber}-${column}`}
                        >
                          {column === "Sno" ? rowNumber : ""}
                        </td>
                      ))}
                      {groupedColumns.flatMap((group) =>
                        group.columns.map((column) => (
                          <td
                            className="h-12 border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700"
                            key={`${rowNumber}-${group.label}-${column}`}
                          />
                        ))
                      )}
                      {finalColumns.map((column) => (
                        <td
                          className="h-12 border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700"
                          key={`${rowNumber}-${column}`}
                        />
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
