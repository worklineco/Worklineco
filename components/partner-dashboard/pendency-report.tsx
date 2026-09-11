"use client";

import Link from "next/link";
import { ArrowRight, Scale, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { getCached, setCached } from "@/lib/data-cache";
import {
  pendencyKindShortLabels,
  pendencyUrgencies,
  pendencyUrgencyColors,
  pendencyUrgencyLabels,
  type PendencyKind,
  type PendencySummary,
  type PendencyTeamRow
} from "@/lib/pendency";

/**
 * Partner-only report: pending show cause notices and appeals in the Litigation
 * register, broken down by team. Every number is a link into TaskLine filtered
 * to exactly the matters behind it.
 */

const cacheKey = "partner:pendency:v3";

// Validated against the white card: worst pair dE 23.7 normal, 16.6 protan.
const kindColors: Record<PendencyKind, string> = {
  appeal: "#b6654f",
  scn: "#3a5590"
};

function taskLineHref(params: { due?: "month" | "overdue" | "soon"; kind?: PendencyKind; team?: string }) {
  const search = new URLSearchParams({ pendency: "1" });

  if (params.team) search.set("team", params.team);
  if (params.kind) search.set("kind", params.kind);
  if (params.due) search.set("due", params.due);

  return `/taskline?${search.toString()}`;
}

function CountLink({
  children,
  href,
  muted = false,
  tone = "default"
}: {
  children: React.ReactNode;
  href: string;
  muted?: boolean;
  tone?: "default" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "text-rose-700 hover:bg-rose-50"
      : tone === "warning"
        ? "text-amber-700 hover:bg-amber-50"
        : "text-slate-800 hover:bg-slate-100";

  if (muted) {
    return <span className="inline-block px-2 py-1 text-slate-300">—</span>;
  }

  return (
    <Link
      className={`inline-block rounded px-2 py-1 font-bold tabular-nums underline-offset-2 transition hover:underline ${toneClass}`}
      href={href}
    >
      {children}
    </Link>
  );
}

function SummaryTile({
  hint,
  href,
  label,
  tone = "default",
  value
}: {
  hint?: string;
  href: string;
  label: string;
  tone?: "default" | "danger";
  value: number;
}) {
  return (
    <Link
      className={`flex flex-col rounded-xl border px-3 py-2.5 transition hover:shadow-sm ${
        tone === "danger"
          ? "border-rose-200 bg-rose-50 hover:border-rose-300"
          : "border-slate-200 bg-slate-50 hover:border-navy-300"
      }`}
      href={href}
    >
      <span className={`text-2xl font-black tabular-nums ${tone === "danger" ? "text-rose-700" : "text-slate-950"}`}>
        {value.toLocaleString("en-IN")}
      </span>
      <span className="mt-0.5 text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</span>
      {hint ? <span className="mt-0.5 text-[11px] font-semibold text-slate-400">{hint}</span> : null}
    </Link>
  );
}

/**
 * One row per team: a bold bar split into SCNs and Appeals so team workloads
 * stay directly comparable, with a thin urgency strip beneath it carrying the
 * register's colour language. Counts sit at the end of every bar and the strip
 * is named in its own legend, so neither reading depends on colour alone.
 */
function TeamRow({ row, scale }: { row: PendencyTeamRow; scale: number }) {
  const widthPercent = `${Math.max((row.total / scale) * 100, 2)}%`;
  const kinds: PendencyKind[] = ["scn", "appeal"];

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-24 shrink-0 truncate text-right text-xs font-bold text-slate-700" title={row.team}>
        {row.team}
      </span>

      <div className="min-w-0 flex-1">
        <div style={{ width: widthPercent }}>
          <div className="flex h-6 items-stretch gap-[2px]">
            {kinds.map((kind) =>
              row[kind] ? (
                <Link
                  aria-label={`${row[kind]} pending ${pendencyKindShortLabels[kind]} for ${row.team}`}
                  className="flex items-center justify-end overflow-hidden rounded-[4px] px-1.5 transition hover:opacity-85"
                  href={taskLineHref({ kind, team: row.team })}
                  key={kind}
                  style={{ backgroundColor: kindColors[kind], flexGrow: row[kind], flexBasis: 0 }}
                  title={`${row.team} · ${row[kind]} ${pendencyKindShortLabels[kind]} pending`}
                >
                  <span className="text-[10px] font-black tabular-nums text-white/90">{row[kind]}</span>
                </Link>
              ) : null
            )}
          </div>

          <div className="mt-[3px] flex h-[6px] items-stretch gap-[2px]">
            {pendencyUrgencies.map((urgency) => {
              const value = row.urgency?.[urgency] ?? 0;
              if (!value) return null;
              return (
                <span
                  className="rounded-[2px]"
                  key={urgency}
                  style={{ backgroundColor: pendencyUrgencyColors[urgency], flexGrow: value, flexBasis: 0 }}
                  title={`${row.team} · ${pendencyUrgencyLabels[urgency]}: ${value}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <span className="w-9 shrink-0 text-right text-sm font-black tabular-nums text-slate-800">{row.total}</span>
    </div>
  );
}

export function PendencyReport() {
  const [summary, setSummary] = useState<PendencySummary | null>(() => getCached<PendencySummary>(cacheKey) ?? null);
  const [isLoading, setIsLoading] = useState(!summary);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void fetch("/api/taskline?view=pendency", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, result: (await response.json()) as PendencySummary & { error?: string } }))
      .then(({ ok, result }) => {
        if (!active) return;
        if (!ok) {
          setError(result.error ?? "Could not load the pendency report.");
          return;
        }
        setSummary(result);
        setCached(cacheKey, result);
        setError("");
      })
      .catch(() => {
        if (active) setError("Could not load the pendency report.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (error && !summary) {
    return null;
  }

  const teams = summary?.teams ?? [];
  const totals = summary?.totals;
  const scale = Math.max(1, ...teams.map((row) => row.total));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="size-5 text-navy-700" />
            <h3 className="text-base font-black text-slate-950">Pendency by team</h3>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Show cause notices and appeals in Litigation still to be submitted. Cancelled, on-hold and closed matters are
            left out. Click any number to open those matters in TaskLine.
          </p>
        </div>
        {summary ? <span className="text-[11px] font-bold text-slate-400">As on {summary.asOf}</span> : null}
      </div>

      {isLoading && !summary ? (
        <p className="mt-4 text-sm font-bold text-slate-400">Loading pendency…</p>
      ) : !totals || !totals.total ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm font-bold text-emerald-700">
          Nothing pending. Every show cause notice and appeal is submitted, cancelled, on hold or closed.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile href={taskLineHref({})} label="Total pending" value={totals.total} />
            <SummaryTile href={taskLineHref({ kind: "scn" })} label="SCNs" value={totals.scn} />
            <SummaryTile href={taskLineHref({ kind: "appeal" })} label="Appeals" value={totals.appeal} />
            <SummaryTile
              hint={totals.dueThisMonth ? `${totals.dueThisMonth} due this month` : undefined}
              href={taskLineHref({ due: "overdue" })}
              label="Overdue"
              tone={totals.overdue ? "danger" : "default"}
              value={totals.overdue}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-100 pb-2">
            {(["scn", "appeal"] as PendencyKind[]).map((kind) => (
              <span className="flex items-center gap-1.5 text-[11px] font-black text-slate-700" key={kind}>
                <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: kindColors[kind] }} />
                {pendencyKindShortLabels[kind]}
              </span>
            ))}
            <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Due</span>
              {pendencyUrgencies.map((urgency) => (
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600" key={urgency}>
                  <span className="h-[6px] w-4 rounded-[2px]" style={{ backgroundColor: pendencyUrgencyColors[urgency] }} />
                  {pendencyUrgencyLabels[urgency]}
                </span>
              ))}
            </span>
          </div>

          <div className="mt-1 divide-y divide-slate-50">
            {teams.slice(0, 8).map((row) => (
              <TeamRow key={row.team} row={row} scale={scale} />
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Team</th>
                  <th className="py-2 pr-3 text-right">SCNs</th>
                  <th className="py-2 pr-3 text-right">Appeals</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Overdue</th>
                  <th className="py-2 pr-3 text-right">Due ≤ 7d</th>
                  <th className="py-2 pr-3 text-right" title="Falling due between today and the end of this month">
                    Due this month
                  </th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {teams.map((row) => (
                  <tr className="border-b border-slate-100 last:border-b-0" key={row.team}>
                    <td className="py-1.5 pr-3 font-bold text-slate-800">{row.team}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={taskLineHref({ kind: "scn", team: row.team })} muted={!row.scn}>
                        {row.scn}
                      </CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={taskLineHref({ kind: "appeal", team: row.team })} muted={!row.appeal}>
                        {row.appeal}
                      </CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={taskLineHref({ team: row.team })}>{row.total}</CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={taskLineHref({ due: "overdue", team: row.team })} muted={!row.overdue} tone="danger">
                        <span className="inline-flex items-center gap-1">
                          <TriangleAlert className="size-3" />
                          {row.overdue}
                        </span>
                      </CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={taskLineHref({ due: "soon", team: row.team })} muted={!row.dueSoon} tone="warning">
                        {row.dueSoon}
                      </CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={taskLineHref({ due: "month", team: row.team })} muted={!row.dueThisMonth}>
                        {row.dueThisMonth}
                      </CountLink>
                    </td>
                    <td className="py-1.5 text-right">
                      <Link
                        aria-label={`Open all pending matters for ${row.team} in TaskLine`}
                        className="inline-flex size-7 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-navy-50 hover:text-navy-700"
                        href={taskLineHref({ team: row.team })}
                        title={`Open ${row.team} in TaskLine`}
                      >
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-slate-950">
                  <td className="py-2 pr-3 text-[11px] font-black uppercase tracking-wide">All teams</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums">{totals.scn}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums">{totals.appeal}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums">{totals.total}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums text-rose-700">{totals.overdue}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums text-amber-700">{totals.dueSoon}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums">{totals.dueThisMonth}</td>
                  <td className="py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
