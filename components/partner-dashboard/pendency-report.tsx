"use client";

import Link from "next/link";
import { ArrowRight, Scale, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { getCached, setCached } from "@/lib/data-cache";
import {
  pendencyDueBucketColors,
  pendencyDueBucketLabels,
  pendencyDueBuckets,
  pendencyKindShortLabels,
  type PendencyDueBucket,
  type PendencyKind,
  type PendencySummary,
  type PendencyTeamRow
} from "@/lib/pendency";

/**
 * Partner-only report: pending show cause notices and appeals in the Litigation
 * register, broken down by team. Every number is a link into TaskLine filtered
 * to exactly the matters behind it.
 */

const cacheKey = "partner:pendency:v2";

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
 * One bar per kind per team, banded by due-date urgency using the same colours
 * the Litigation register paints on its Due Date column. The SCN and Appeals
 * split stays legible because each gets its own labelled bar, and the count at
 * the end means urgency is never carried by colour alone.
 */
function KindBar({ kind, row, scale }: { kind: PendencyKind; row: PendencyTeamRow; scale: number }) {
  const counts = row.buckets?.[kind];
  const total = row[kind];

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">
        {pendencyKindShortLabels[kind]}
      </span>
      <span className="flex h-4 min-w-0 flex-1 items-center gap-[2px]" role="presentation">
        {total
          ? pendencyDueBuckets.map((bucket) => {
              const value = counts?.[bucket] ?? 0;
              if (!value) return null;
              return (
                <Link
                  aria-label={`${value} ${pendencyKindShortLabels[kind]} for ${row.team}: ${pendencyDueBucketLabels[bucket]}`}
                  className="h-full rounded-[3px] ring-1 ring-inset ring-slate-900/10 transition hover:opacity-75"
                  href={taskLineHref({ kind, team: row.team })}
                  key={bucket}
                  style={{ backgroundColor: pendencyDueBucketColors[bucket], width: `${(value / scale) * 100}%` }}
                  title={`${row.team} · ${pendencyKindShortLabels[kind]} · ${pendencyDueBucketLabels[bucket]}: ${value}`}
                />
              );
            })
          : null}
      </span>
      <span className="w-7 shrink-0 text-right text-[11px] font-black tabular-nums text-slate-600">{total || "—"}</span>
    </div>
  );
}

function TeamBar({ row, scale }: { row: PendencyTeamRow; scale: number }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className="w-24 shrink-0 truncate pt-0.5 text-right text-xs font-bold text-slate-700" title={row.team}>
        {row.team}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <KindBar kind="scn" row={row} scale={scale} />
        <KindBar kind="appeal" row={row} scale={scale} />
      </div>
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
  const scale = Math.max(1, ...teams.flatMap((row) => [row.scn, row.appeal]));

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

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {pendencyDueBuckets.map((bucket) => (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600" key={bucket}>
                <span
                  className="size-2.5 rounded-[3px] ring-1 ring-inset ring-slate-900/10"
                  style={{ backgroundColor: pendencyDueBucketColors[bucket] }}
                />
                {pendencyDueBucketLabels[bucket]}
              </span>
            ))}
          </div>

          <div className="mt-2">
            {teams.slice(0, 8).map((row) => (
              <TeamBar key={row.team} row={row} scale={scale} />
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
