"use client";

import { useEffect, useState } from "react";
import { LoadingIndicator } from "@/components/shared/loading-indicator";

type AgingTeam = {
  b0_7: number;
  b31_60: number;
  b60plus: number;
  b8_30: number;
  oldest: number;
  team: string;
  total: number;
};

const buckets = [
  { color: "#22c55e", key: "b0_7" as const, label: "0–7 days" },
  { color: "#eab308", key: "b8_30" as const, label: "8–30 days" },
  { color: "#f97316", key: "b31_60" as const, label: "31–60 days" },
  { color: "#ef4444", key: "b60plus" as const, label: "60+ days" }
];

export function TaskAgingReport() {
  const [teams, setTeams] = useState<AgingTeam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/taskline?view=aging", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { teams: [] }))
      .then((data) => {
        if (active) {
          setTeams(Array.isArray(data?.teams) ? (data.teams as AgingTeam[]) : []);
        }
      })
      .catch(() => active && setTeams([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const maxTotal = Math.max(1, ...teams.map((team) => team.total));
  const grandTotal = teams.reduce((sum, team) => sum + team.total, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-navy-800">Open task ageing — by team</h2>
          <p className="mt-0.5 text-xs font-bold text-slate-400">
            Not-started open tasks (stage blank / Open / review, status Open), grouped by days since added.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {buckets.map((bucket) => (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600" key={bucket.key}>
              <span className="size-3 rounded-sm" style={{ backgroundColor: bucket.color }} />
              {bucket.label}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
          <LoadingIndicator label="Loading ageing report…" />
        </p>
      ) : teams.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
          No open, not-started tasks right now.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {teams.map((team) => (
            <div className="flex items-center gap-3" key={team.team}>
              <div className="w-28 shrink-0 truncate text-sm font-black text-slate-700" title={team.team}>
                {team.team}
              </div>
              <div className="h-7 flex-1">
                <div
                  className="flex h-7 overflow-hidden rounded-md bg-slate-100"
                  style={{ minWidth: "44px", width: `${Math.max(6, (team.total / maxTotal) * 100)}%` }}
                >
                  {buckets.map((bucket) =>
                    team[bucket.key] > 0 ? (
                      <div
                        className="flex items-center justify-center text-[11px] font-black text-white"
                        key={bucket.key}
                        style={{ backgroundColor: bucket.color, flexGrow: team[bucket.key], flexBasis: 0 }}
                        title={`${bucket.label}: ${team[bucket.key]}`}
                      >
                        {team[bucket.key]}
                      </div>
                    ) : null
                  )}
                </div>
              </div>
              <div className="w-32 shrink-0 text-right text-xs font-bold text-slate-500">
                {team.total} open · oldest {team.oldest}d
              </div>
            </div>
          ))}
          <div className="border-t border-slate-100 pt-2 text-right text-xs font-black text-slate-500">
            {grandTotal} open not-started tasks across {teams.length} team{teams.length === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </section>
  );
}
