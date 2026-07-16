"use client";

import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCached, setCached } from "@/lib/data-cache";

type AuditValue = Record<string, string | number> | string | number | null;
type AuditLog = {
  action: string;
  actor_user_id: string | null;
  actor_name?: string;
  appeal?: { data?: Record<string, string | number>; row_number?: number } | null;
  created_at: string;
  field_name: string | null;
  id: string;
  new_value: AuditValue;
  old_value: AuditValue;
};

export function GstatAuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    const cached = getCached<AuditLog[]>("gstat-audit");

    if (cached) {
      setLogs(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    const response = await fetch("/api/gstat/audit");
    const result = (await response.json()) as { error?: string; logs?: AuditLog[] };

    if (!response.ok) {
      setMessage(result.error ?? "Could not load GSTAT audit trail.");
      setIsLoading(false);
      return;
    }

    setCached("gstat-audit", result.logs ?? []);
    setLogs(result.logs ?? []);
    setMessage("");
    setIsLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#f4f6fa] px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 " />
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
                <span className="flex size-12 items-center justify-center rounded-2xl bg-navy-700 text-white">
                  <ShieldCheck className="size-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-navy-700">Change history</p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950">GSTAT Audit Trail</h1>
                </div>
              </div>
            </div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-navy-700 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-navy-800"
              onClick={loadLogs}
              type="button"
            >
              <RefreshCw className="size-4" />
              Refresh
            </button>
          </div>
          {message ? <p className="mt-4 text-sm font-bold text-rose-700">{message}</p> : null}
          {isLoading ? <p className="mt-4 text-sm font-bold text-slate-500">Loading GSTAT audit trail...</p> : null}
        </header>

        <section className="workline-frame mt-5 rounded-[28px] p-2 md:p-3">
          <div className="overflow-hidden rounded-2xl border border-slate-950/10 bg-white">
            <div className="max-h-[calc(100vh-245px)] overflow-auto">
              <table className="min-w-[1200px] border-separate border-spacing-0 text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
                  <tr>
                    {["Time", "Action", "Row", "Team", "Changed Column", "Old Value", "New Value", "User"].map((heading) => (
                      <th className="border-b border-r border-white/15 px-3 py-3 font-black" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr className="odd:bg-white even:bg-slate-50/80" key={log.id}>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-black text-slate-900">
                        {log.action}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {log.appeal?.row_number ?? "-"}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {String(log.appeal?.data?.["Person handling"] ?? valueTeam(log.new_value) ?? "-")}
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {log.field_name ?? "-"}
                      </td>
                      <td className="max-w-xs border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-600">
                        <span className="block truncate" title={formatValue(log.old_value)}>
                          {formatValue(log.old_value)}
                        </span>
                      </td>
                      <td className="max-w-xs border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-600">
                        <span className="block truncate" title={formatValue(log.new_value)}>
                          {formatValue(log.new_value)}
                        </span>
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {log.actor_name ?? log.actor_user_id?.slice(0, 8) ?? "-"}
                      </td>
                    </tr>
                  ))}
                  {!logs.length && !isLoading ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-sm font-bold text-slate-500" colSpan={8}>
                        No GSTAT audit entries found.
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

function formatValue(value: AuditValue) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function valueTeam(value: AuditValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  return String(value["Person handling"] ?? "");
}
