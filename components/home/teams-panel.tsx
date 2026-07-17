"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Mail, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TeamMember = {
  designation: string;
  email: string;
  id: string;
  joining_date: string;
  name: string;
  team: string;
};

type SortKey = "serial" | "name" | "team" | "email" | "designation" | "joining_date" | "leaving_date";
type SortDirection = "asc" | "desc";

const ARTICLE_ASSISTANT_TENURE_DAYS = 730;

export function TeamsPanel() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("serial");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  async function loadMembers() {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/teams", { cache: "no-store" });
      const result = (await response.json()) as { error?: string; members?: TeamMember[] };

      if (!response.ok) {
        setMessage(result.error ?? "Could not load team members.");
        setMembers([]);
        return;
      }

      setMembers(result.members ?? []);
    } catch (error) {
      console.error("Team members load error:", error);
      setMessage("Could not load team members.");
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  const sortedMembers = useMemo(() => {
    const indexedMembers = members.map((member, index) => ({ member, originalIndex: index }));

    return indexedMembers.sort((left, right) => {
      const leftValue = getSortValue(left.member, left.originalIndex, sortKey);
      const rightValue = getSortValue(right.member, right.originalIndex, sortKey);
      const comparison = compareSortValues(leftValue, rightValue);

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [members, sortDirection, sortKey]);

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  return (
    <section className="workline-frame mt-5 rounded-[26px] p-5 md:p-6" id="teams">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-black uppercase text-violet-800">
            <UsersRound className="size-3.5" />
            Teams
          </div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">Team Members</h2>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-navy-700 px-4 text-xs font-black uppercase text-white transition hover:bg-navy-800 disabled:bg-slate-500"
          disabled={isLoading}
          onClick={loadMembers}
          type="button"
        >
          <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-950/10 bg-white shadow-sm ring-1 ring-white/70">
        <div className="overflow-x-auto">
          <div className="grid min-w-[1160px] grid-cols-[0.45fr_1.1fr_0.6fr_1.4fr_1fr_0.9fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-500">
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="S.No" onSort={changeSort} sortKey="serial" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Name" onSort={changeSort} sortKey="name" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Team No" onSort={changeSort} sortKey="team" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Email ID" onSort={changeSort} sortKey="email" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Designation" onSort={changeSort} sortKey="designation" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Joining Date" onSort={changeSort} sortKey="joining_date" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Leaving Date" onSort={changeSort} sortKey="leaving_date" />
          </div>

          {isLoading ? <p className="px-4 py-5 text-sm font-bold text-slate-500">Loading team members...</p> : null}
          {!isLoading && message ? <p className="px-4 py-5 text-sm font-bold text-red-600">{message}</p> : null}
          {!isLoading && !message && members.length === 0 ? <p className="px-4 py-5 text-sm font-bold text-slate-500">No team members found.</p> : null}

          {!isLoading && !message && sortedMembers.map(({ member }, index) => (
            <div
              className="grid min-w-[1160px] grid-cols-[0.45fr_1.1fr_0.6fr_1.4fr_1fr_0.9fr_0.9fr] gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
              key={member.id}
            >
              <p className="font-bold text-slate-600">{index + 1}</p>
              <div className="min-w-0"><p className="truncate font-black text-slate-950">{member.name}</p></div>
              <p className="truncate font-bold text-slate-600">{member.team || "-"}</p>
              <div className="flex min-w-0 items-center gap-2 font-semibold text-slate-700">
                <Mail className="size-4 shrink-0 text-slate-400" />
                <span className="truncate">{member.email}</span>
              </div>
              <p className="truncate font-bold text-slate-700">{member.designation}</p>
              <p className="truncate font-bold text-slate-600">{formatDate(member.joining_date)}</p>
              <p className="truncate font-bold text-slate-600">{formatDate(getLeavingDate(member))}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SortableHeader({ activeKey, direction, label, onSort, sortKey }: { activeKey: SortKey; direction: SortDirection; label: string; onSort: (key: SortKey) => void; sortKey: SortKey }) {
  const Icon = activeKey !== sortKey ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <button className="flex items-center gap-1 text-left transition hover:text-slate-900" onClick={() => onSort(sortKey)} type="button">
      <span>{label}</span>
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function getLeavingDate(member: TeamMember) {
  if (member.designation.trim().toLowerCase() !== "article assistant" || !member.joining_date) return "";
  const joiningDate = new Date(member.joining_date);
  if (Number.isNaN(joiningDate.getTime())) return "";
  const leavingDate = new Date(joiningDate);
  leavingDate.setUTCDate(leavingDate.getUTCDate() + ARTICLE_ASSISTANT_TENURE_DAYS);
  return leavingDate.toISOString();
}

function getSortValue(member: TeamMember, originalIndex: number, key: SortKey) {
  if (key === "serial") return originalIndex;
  if (key === "joining_date") return toTimestamp(member.joining_date);
  if (key === "leaving_date") return toTimestamp(getLeavingDate(member));
  return member[key].trim().toLocaleLowerCase();
}

function compareSortValues(left: number | string, right: number | string) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function toTimestamp(value: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

