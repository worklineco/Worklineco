"use client";

import Link from "next/link";
import { ArrowRight, Gavel, Landmark, Scale, TriangleAlert, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCached, setCached } from "@/lib/data-cache";
import {
  pendencyKindShortLabels,
  pendencySectionKinds,
  pendencyUrgencies,
  pendencyUrgencyColors,
  pendencyUrgencyLabels,
  sectionTotals,
  teamFocusGroupings,
  teamFocusTotals,
  type PendencyKind,
  type PendencySectionKey,
  type PendencySummary,
  type PendencyTeamRow,
  type TeamFocus,
  type TeamFocusGrouping,
  type TeamFocusRow
} from "@/lib/pendency";

/**
 * Partner-only report. One chart per stream: show cause notices and appeals in
 * Litigation, GSTAT appeals, and GSTAT personal hearings. All three read from a
 * single summary call, and every number links into TaskLine filtered to exactly
 * the matters behind it.
 */

const cacheKey = "partner:pendency:v5";

// Validated against the white card: every pair clears the normal-vision floor
// (worst 18.5) and the colour-vision floor (worst 8.9 deutan).
const kindColors: Record<PendencyKind, string> = {
  appeal: "#b6654f",
  gstatAppeal: "#7c3aed",
  gstatPh: "#0d9488",
  scn: "#3a5590"
};

const sectionMeta: Record<PendencySectionKey, { description: string; icon: typeof Scale; title: string }> = {
  gstatAppeal: {
    description: "GSTAT appeals still to be filed. Cancelled, on-hold and closed matters are left out.",
    icon: Landmark,
    title: "GSTAT appeals by team"
  },
  gstatPh: {
    description: "GSTAT personal hearings still open. Cancelled, on-hold and closed matters are left out.",
    icon: Gavel,
    title: "GSTAT personal hearings by team"
  },
  litigation: {
    description:
      "Show cause notices and appeals in Litigation still to be submitted or filed. GSTAT work, cancelled, on-hold and closed matters are left out.",
    icon: Scale,
    title: "Pendency by team"
  }
};

type DueFilter = "month" | "overdue" | "soon" | "today";

function taskLineHref(params: { due?: DueFilter; kind?: PendencyKind; kinds?: PendencyKind[]; team?: string }) {
  const search = new URLSearchParams({ pendency: "1" });
  const kind = params.kind ?? (params.kinds?.length === 1 ? params.kinds[0] : undefined);

  if (params.team) search.set("team", params.team);
  if (kind) search.set("kind", kind);
  if (!kind && params.kinds?.length) search.set("kinds", params.kinds.join(","));
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
 * A team's bar for one kind, with its own urgency strip underneath in the
 * register's colour language, so lateness can be read per kind rather than
 * only for the team as a whole.
 */
function KindColumn({ kind, row }: { kind: PendencyKind; row: PendencyTeamRow }) {
  const counts = row.urgency?.[kind];
  const total = row.counts[kind] ?? 0;

  return (
    <div className="flex min-w-0 flex-col" style={{ flexGrow: total, flexBasis: 0 }}>
      <Link
        aria-label={`${total} pending ${pendencyKindShortLabels[kind]} for ${row.team}`}
        className="flex h-6 items-center justify-end overflow-hidden rounded-[4px] px-1.5 transition hover:opacity-85"
        href={taskLineHref({ kind, team: row.team })}
        style={{ backgroundColor: kindColors[kind] }}
        title={`${row.team} · ${total} ${pendencyKindShortLabels[kind]} pending`}
      >
        <span className="text-[10px] font-black tabular-nums text-white/90">{total}</span>
      </Link>

      <div className="mt-[3px] flex h-[6px] items-stretch gap-[2px]">
        {pendencyUrgencies.map((urgency) => {
          const value = counts?.[urgency] ?? 0;
          if (!value) return null;
          return (
            <span
              className="rounded-[2px]"
              key={urgency}
              style={{ backgroundColor: pendencyUrgencyColors[urgency], flexGrow: value, flexBasis: 0 }}
              title={`${row.team} · ${pendencyKindShortLabels[kind]} · ${pendencyUrgencyLabels[urgency]}: ${value}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function TeamRow({ kinds, row, scale }: { kinds: PendencyKind[]; row: PendencyTeamRow; scale: number }) {
  const total = sectionTotals(row, kinds).total;
  const widthPercent = `${Math.max((total / scale) * 100, 2)}%`;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-24 shrink-0 truncate text-right text-xs font-bold text-slate-700" title={row.team}>
        {row.team}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-[3px]" style={{ width: widthPercent }}>
          {kinds.map((kind) => (row.counts[kind] ? <KindColumn key={kind} kind={kind} row={row} /> : null))}
        </div>
      </div>

      <span className="w-9 shrink-0 text-right text-sm font-black tabular-nums text-slate-800">{total}</span>
    </div>
  );
}

function PendencySection({ asOf, section, teams }: { asOf: string; section: PendencySectionKey; teams: PendencyTeamRow[] }) {
  const kinds = pendencySectionKinds[section];
  const meta = sectionMeta[section];
  const Icon = meta.icon;

  const rows = teams
    .map((row) => ({ row, totals: sectionTotals(row, kinds) }))
    .filter(({ totals }) => totals.total > 0)
    .sort((first, second) => second.totals.total - first.totals.total);

  const grand = rows.reduce(
    (sum, { totals }) => ({
      dueSoon: sum.dueSoon + totals.dueSoon,
      dueThisMonth: sum.dueThisMonth + totals.dueThisMonth,
      overdue: sum.overdue + totals.overdue,
      total: sum.total + totals.total
    }),
    { dueSoon: 0, dueThisMonth: 0, overdue: 0, total: 0 }
  );

  const scale = Math.max(1, ...rows.map(({ totals }) => totals.total));
  const showKindSplit = kinds.length > 1;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-navy-700" />
            <h3 className="text-base font-black text-slate-950">{meta.title}</h3>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {meta.description} Click any number to open those matters in TaskLine.
          </p>
        </div>
        <span className="text-[11px] font-bold text-slate-400">As on {asOf}</span>
      </div>

      {!grand.total ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm font-bold text-emerald-700">
          Nothing pending here.
        </p>
      ) : (
        <>
          <div className={`mt-3 grid gap-2 ${showKindSplit ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
            <SummaryTile href={taskLineHref({ kinds })} label="Total pending" value={grand.total} />
            {showKindSplit ? (
              kinds.map((kind) => (
                <SummaryTile
                  href={taskLineHref({ kind })}
                  key={kind}
                  label={pendencyKindShortLabels[kind]}
                  value={rows.reduce((sum, { row }) => sum + (row.counts[kind] ?? 0), 0)}
                />
              ))
            ) : (
              <SummaryTile
                href={taskLineHref({ due: "month", kinds })}
                label="Due this month"
                value={grand.dueThisMonth}
              />
            )}
            <SummaryTile
              hint={grand.dueThisMonth ? `${grand.dueThisMonth} due this month` : undefined}
              href={taskLineHref({ due: "overdue", kinds })}
              label="Overdue"
              tone={grand.overdue ? "danger" : "default"}
              value={grand.overdue}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-100 pb-2">
            {kinds.map((kind) => (
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
            {rows.slice(0, 8).map(({ row }) => (
              <TeamRow key={row.team} kinds={kinds} row={row} scale={scale} />
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Team</th>
                  {showKindSplit
                    ? kinds.map((kind) => (
                        <th className="py-2 pr-3 text-right" key={kind}>
                          {pendencyKindShortLabels[kind]}
                        </th>
                      ))
                    : null}
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Overdue</th>
                  <th className="py-2 pr-3 text-right">Due ≤ 7d</th>
                  <th className="py-2 pr-3 text-right">Due this month</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, totals }) => (
                  <tr className="border-b border-slate-100 last:border-b-0" key={row.team}>
                    <td className="py-1.5 pr-3 font-bold text-slate-800">{row.team}</td>
                    {showKindSplit
                      ? kinds.map((kind) => (
                          <td className="py-1.5 pr-3 text-right" key={kind}>
                            <CountLink href={taskLineHref({ kind, team: row.team })} muted={!row.counts[kind]}>
                              {row.counts[kind] ?? 0}
                            </CountLink>
                          </td>
                        ))
                      : null}
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={taskLineHref({ kinds, team: row.team })}>{totals.total}</CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink
                        href={taskLineHref({ due: "overdue", kinds, team: row.team })}
                        muted={!totals.overdue}
                        tone="danger"
                      >
                        <span className="inline-flex items-center gap-1">
                          <TriangleAlert className="size-3" />
                          {totals.overdue}
                        </span>
                      </CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={taskLineHref({ due: "soon", kinds, team: row.team })} muted={!totals.dueSoon} tone="warning">
                        {totals.dueSoon}
                      </CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={taskLineHref({ due: "month", kinds, team: row.team })} muted={!totals.dueThisMonth}>
                        {totals.dueThisMonth}
                      </CountLink>
                    </td>
                    <td className="py-1.5 text-right">
                      <Link
                        aria-label={`Open all pending matters for ${row.team} in TaskLine`}
                        className="inline-flex size-7 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-navy-50 hover:text-navy-700"
                        href={taskLineHref({ kinds, team: row.team })}
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
                  {showKindSplit
                    ? kinds.map((kind) => (
                        <td className="py-2 pr-3 text-right font-black tabular-nums" key={kind}>
                          {rows.reduce((sum, { row }) => sum + (row.counts[kind] ?? 0), 0)}
                        </td>
                      ))
                    : null}
                  <td className="py-2 pr-3 text-right font-black tabular-nums">{grand.total}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums text-rose-700">{grand.overdue}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums text-amber-700">{grand.dueSoon}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums">{grand.dueThisMonth}</td>
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

/** Every open task of one team, whatever its type. Grouped by task or by person. */
function teamFocusHref(params: { due?: DueFilter; group?: TeamFocusGrouping; label?: string; team: string }) {
  const search = new URLSearchParams({ pendency: "1", scope: "all", team: params.team });

  if (params.label && params.group) {
    search.set(params.group === "name" ? "name" : "task", params.label);
  }

  if (params.due) {
    search.set("due", params.due);
  }

  return `/taskline?${search.toString()}`;
}

function TeamFocusBar({
  group,
  row,
  scale,
  team
}: {
  group: TeamFocusGrouping;
  row: TeamFocusRow;
  scale: number;
  team: string;
}) {
  const widthPercent = `${Math.max((row.total / scale) * 100, 3)}%`;
  const share = Math.round((row.urgency.overdue / Math.max(row.total, 1)) * 100);

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-40 shrink-0 truncate text-right text-xs font-bold text-slate-700" title={row.label}>
        {row.label}
      </span>

      <div className="min-w-0 flex-1">
        <Link
          aria-label={`${row.total} open tasks for ${row.label}`}
          className="flex h-6 items-stretch overflow-hidden rounded-[4px] bg-slate-100 transition hover:opacity-85"
          href={teamFocusHref({ group, label: row.label, team })}
          style={{ width: widthPercent }}
          title={`${row.label} · ${row.total} open${row.urgency.overdue ? ` · ${row.urgency.overdue} overdue (${share}%)` : ""}`}
        >
          {pendencyUrgencies.map((urgency) => {
            const value = row.urgency[urgency] ?? 0;
            if (!value) return null;
            return (
              <span
                className="flex items-center justify-center"
                key={urgency}
                style={{ backgroundColor: pendencyUrgencyColors[urgency], flexGrow: value, flexBasis: 0 }}
                title={`${row.label} · ${pendencyUrgencyLabels[urgency]}: ${value}`}
              >
                {value / row.total > 0.16 ? (
                  <span className="text-[10px] font-black tabular-nums text-white/90">{value}</span>
                ) : null}
              </span>
            );
          })}
        </Link>
      </div>

      <span className="w-9 shrink-0 text-right text-sm font-black tabular-nums text-slate-800">{row.total}</span>
    </div>
  );
}

function TeamFocusSection({ asOf, focus }: { asOf: string; focus: TeamFocus }) {
  const [group, setGroup] = useState<TeamFocusGrouping>("task");
  const rows = group === "name" ? focus.byName : focus.byTask;
  const grand = useMemo(() => teamFocusTotals(rows), [rows]);
  const scale = Math.max(1, ...rows.map((row) => row.total));
  const visible = rows.slice(0, 12);

  return (
    <section className="rounded-2xl border border-navy-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="size-5 text-navy-700" />
            <h3 className="text-base font-black text-slate-950">{focus.team} · my team board</h3>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Every open task with {focus.team}, of every kind — not only notices and appeals. Submitted, filed, cancelled,
            on-hold and closed tasks are left out. Click any bar or number to open those tasks in TaskLine.
          </p>
        </div>
        <span className="text-[11px] font-bold text-slate-400">As on {asOf}</span>
      </div>

      {!grand.total ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm font-bold text-emerald-700">
          Nothing open with {focus.team}.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile href={teamFocusHref({ team: focus.team })} label="Open tasks" value={grand.total} />
            <SummaryTile
              href={teamFocusHref({ due: "overdue", team: focus.team })}
              label="Overdue"
              tone={grand.overdue ? "danger" : "default"}
              value={grand.overdue}
            />
            <SummaryTile href={teamFocusHref({ due: "today", team: focus.team })} label="Due today" value={grand.urgency.today} />
            <SummaryTile
              hint={grand.dueSoon ? `${grand.dueSoon} within 7 days` : undefined}
              href={teamFocusHref({ due: "month", team: focus.team })}
              label="Due this month"
              value={grand.dueThisMonth}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 pb-2">
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {teamFocusGroupings.map((option) => (
                <button
                  className={`rounded-md px-2.5 py-1 text-[11px] font-black transition ${
                    group === option.key ? "bg-white text-navy-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                  key={option.key}
                  onClick={() => setGroup(option.key)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

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
            {visible.map((row) => (
              <TeamFocusBar group={group} key={row.label} row={row} scale={scale} team={focus.team} />
            ))}
          </div>

          {rows.length > visible.length ? (
            <p className="mt-1 text-[11px] font-bold text-slate-400">
              Showing the {visible.length} largest of {rows.length}. The table below has them all.
            </p>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">{group === "name" ? "Person" : "Task"}</th>
                  <th className="py-2 pr-3 text-right">Open</th>
                  <th className="py-2 pr-3 text-right">Overdue</th>
                  <th className="py-2 pr-3 text-right">Due today</th>
                  <th className="py-2 pr-3 text-right">Due ≤ 7d</th>
                  <th className="py-2 pr-3 text-right">Due this month</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-slate-100 last:border-b-0" key={row.label}>
                    <td className="py-1.5 pr-3 font-bold text-slate-800">{row.label}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink href={teamFocusHref({ group, label: row.label, team: focus.team })}>{row.total}</CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink
                        href={teamFocusHref({ due: "overdue", group, label: row.label, team: focus.team })}
                        muted={!row.urgency.overdue}
                        tone="danger"
                      >
                        <span className="inline-flex items-center gap-1">
                          <TriangleAlert className="size-3" />
                          {row.urgency.overdue}
                        </span>
                      </CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink
                        href={teamFocusHref({ due: "today", group, label: row.label, team: focus.team })}
                        muted={!row.urgency.today}
                        tone="warning"
                      >
                        {row.urgency.today}
                      </CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink
                        href={teamFocusHref({ due: "soon", group, label: row.label, team: focus.team })}
                        muted={!row.dueSoon}
                        tone="warning"
                      >
                        {row.dueSoon}
                      </CountLink>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <CountLink
                        href={teamFocusHref({ due: "month", group, label: row.label, team: focus.team })}
                        muted={!(row.urgency.today + row.urgency.thisMonth)}
                      >
                        {row.urgency.today + row.urgency.thisMonth}
                      </CountLink>
                    </td>
                    <td className="py-1.5 text-right">
                      <Link
                        aria-label={`Open ${row.label} in TaskLine`}
                        className="inline-flex size-7 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-navy-50 hover:text-navy-700"
                        href={teamFocusHref({ group, label: row.label, team: focus.team })}
                        title={`Open ${row.label} in TaskLine`}
                      >
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-slate-950">
                  <td className="py-2 pr-3 text-[11px] font-black uppercase tracking-wide">{focus.team} total</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums">{grand.total}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums text-rose-700">{grand.overdue}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums text-amber-700">{grand.urgency.today}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums text-amber-700">{grand.dueSoon}</td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums">{grand.dueThisMonth}</td>
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

  if (isLoading && !summary) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-400">Loading pendency…</p>
      </section>
    );
  }

  const teams = summary?.teams ?? [];
  const sections: PendencySectionKey[] = ["litigation", "gstatAppeal", "gstatPh"];

  const asOf = summary?.asOf ?? "";

  return (
    <>
      {summary?.teamFocus ? <TeamFocusSection asOf={asOf} focus={summary.teamFocus} /> : null}
      {sections.map((section) => (
        <PendencySection asOf={asOf} key={section} section={section} teams={teams} />
      ))}
    </>
  );
}
