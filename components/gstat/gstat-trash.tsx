"use client";

import { ArrowLeft, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type TrashRow = {
  data: Record<string, string | number>;
  delete_action: string;
  deleted_at: string;
  deleted_by_name?: string;
  expires_at: string;
  id: string;
  original_row_number: number;
};

export function GstatTrash() {
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    loadRows();
  }, []);

  async function loadRows() {
    setIsLoading(true);
    const response = await fetch("/api/gstat/trash");
    const result = (await response.json()) as { error?: string; message?: string; rows?: TrashRow[]; setupRequired?: boolean };

    if (!response.ok) {
      setMessage(result.error ?? "Could not load GSTAT trash.");
      setSetupRequired(false);
      setIsLoading(false);
      return;
    }

    setRows(result.rows ?? []);
    setSetupRequired(Boolean(result.setupRequired));
    setMessage(result.message ?? "");
    setIsLoading(false);
  }

  async function restoreRow(row: TrashRow) {
    const entityName = String(row.data["Entity Name"] ?? `row ${row.original_row_number}`);

    if (!window.confirm(`Restore ${entityName} to GSTAT?`)) {
      return;
    }

    setRestoringId(row.id);
    const response = await fetch("/api/gstat/trash", {
      body: JSON.stringify({ trashIds: [row.id] }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(result.error ?? "Could not restore GSTAT row.");
      setRestoringId(null);
      return;
    }

    setMessage(`Restored ${entityName} to GSTAT.`);
    setRestoringId(null);
    await loadRows();
  }

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(20,184,166,0.18),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(217,70,239,0.16),transparent_26%),radial-gradient(circle_at_48%_92%,rgba(245,158,11,0.16),transparent_32%)]" />
      </div>

      <section className="mx-auto max-w-[1500px]">
        <header className="workline-frame rounded-[28px] p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-slate-950/10 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-700 shadow-sm"
                href="/gstat"
              >
                <ArrowLeft className="size-3.5" />
                GSTAT
              </Link>
              <div className="mt-5 flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <ShieldCheck className="size-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">30-day recovery</p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950">GSTAT Trash</h1>
                </div>
              </div>
            </div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-slate-800"
              onClick={loadRows}
              type="button"
            >
              <RefreshCw className="size-4" />
              Refresh
            </button>
          </div>
          {message ? <p className={`mt-4 text-sm font-bold ${setupRequired ? "text-amber-700" : "text-emerald-700"}`}>{message}</p> : null}
          {isLoading ? <p className="mt-4 text-sm font-bold text-slate-500">Loading deleted GSTAT rows...</p> : null}
        </header>

        <section className="workline-frame mt-5 rounded-[28px] p-2 md:p-3">
          <div className="overflow-hidden rounded-2xl border border-slate-950/10 bg-white">
            <div className="max-h-[calc(100vh-245px)] overflow-auto">
              <table className="min-w-[1250px] border-separate border-spacing-0 text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                  <tr>
                    {["Deleted", "Expires", "Action", "Old Row", "Team", "Entity", "Status", "Deleted By", "Restore"].map((heading) => (
                      <th className="border-b border-r border-white/15 px-3 py-3 font-black" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className="odd:bg-white even:bg-slate-50/80" key={row.id}>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {new Date(row.deleted_at).toLocaleString()}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {new Date(row.expires_at).toLocaleDateString()}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-black text-slate-900">
                        {row.delete_action}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {row.original_row_number}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {String(row.data["Person handling"] ?? "-")}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {String(row.data["Entity Name"] ?? "-")}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {String(row.data.Status ?? "-")}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {row.deleted_by_name ?? "-"}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2">
                        {setupRequired ? (
                          <span className="text-xs font-bold text-slate-500">Setup pending</span>
                        ) : (
                          <button
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black uppercase text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={restoringId === row.id}
                            onClick={() => restoreRow(row)}
                            type="button"
                          >
                            {restoringId === row.id ? <RefreshCw className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                            Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!rows.length && !isLoading ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-sm font-bold text-slate-500" colSpan={9}>
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="size-4" />
                          No deleted GSTAT rows are currently in trash.
                        </span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
