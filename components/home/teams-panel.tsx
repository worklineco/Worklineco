"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Check, Mail, Pencil, RefreshCw, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TeamMember = {
  designation: string;
  email: string;
  id: string;
  joining_date: string;
  leaving_date: string;
  name: string;
  team: string;
};

const editorRoles = ["partner", "others"];

type SortKey = "serial" | "name" | "team" | "email" | "designation" | "joining_date" | "leaving_date";
type SortDirection = "asc" | "desc";
type EditDraft = { designation: string; joining_date: string; leaving_date: string; name: string; team: string };

const ARTICLE_ASSISTANT_TENURE_DAYS = 730;
const gridTemplate = "grid-cols-[0.4fr_1.1fr_0.7fr_1.3fr_1fr_0.9fr_0.9fr_0.8fr]";
const roleOptions = ["Article Assistant", "Associate", "Manager", "Senior Manager", "Partner", "Accounts", "Others"];

export function TeamsPanel() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("serial");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ designation: "", joining_date: "", leaving_date: "", name: "", team: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [myRole, setMyRole] = useState("");

  async function loadMembers() {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/teams", { cache: "no-store" });
      const result = (await response.json()) as { error?: string; me?: { role?: string }; members?: TeamMember[] };

      if (!response.ok) {
        setMessage(result.error ?? "Could not load team members.");
        setMembers([]);
        return;
      }

      setMyRole(String(result.me?.role ?? "").trim());
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

  function startEdit(member: TeamMember) {
    setEditingId(member.id);
    setDraft({
      designation: member.designation === "-" ? "" : member.designation,
      joining_date: toDateInputValue(member.joining_date),
      leaving_date: toDateInputValue(member.leaving_date || getLeavingDate(member)),
      name: member.name,
      team: member.team
    });
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setIsSaving(false);
  }

  async function saveEdit(id: string) {
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/teams", {
        body: JSON.stringify({
          designation: draft.designation,
          id,
          joining_date: draft.joining_date,
          leaving_date: draft.leaving_date,
          name: draft.name,
          team: draft.team
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setMessage(result.error ?? "Could not save this member.");
        return;
      }

      setEditingId(null);
      await loadMembers();
    } catch (error) {
      console.error("Team member save error:", error);
      setMessage("Could not save this member.");
    } finally {
      setIsSaving(false);
    }
  }

  const canEdit = editorRoles.includes(myRole.toLowerCase());

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

      {message ? <p className="mt-3 text-sm font-bold text-red-600">{message}</p> : null}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-950/10 bg-white shadow-sm ring-1 ring-white/70">
        <div className="overflow-x-auto">
          <div className={`grid min-w-[1280px] ${gridTemplate} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-500`}>
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="S.No" onSort={changeSort} sortKey="serial" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Name" onSort={changeSort} sortKey="name" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Team No" onSort={changeSort} sortKey="team" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Email ID" onSort={changeSort} sortKey="email" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Designation" onSort={changeSort} sortKey="designation" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Joining Date" onSort={changeSort} sortKey="joining_date" />
            <SortableHeader activeKey={sortKey} direction={sortDirection} label="Leaving Date" onSort={changeSort} sortKey="leaving_date" />
            <span>Actions</span>
          </div>

          {isLoading ? <p className="px-4 py-5 text-sm font-bold text-slate-500">Loading team members...</p> : null}
          {!isLoading && members.length === 0 && !message ? <p className="px-4 py-5 text-sm font-bold text-slate-500">No team members found.</p> : null}

          {!isLoading && sortedMembers.map(({ member, originalIndex }) => {
            const isEditing = editingId === member.id;

            return (
              <div
                className={`grid min-w-[1280px] ${gridTemplate} items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 ${isEditing ? "bg-navy-50/40" : ""}`}
                key={member.id}
              >
                <p className="font-bold text-slate-600">{originalIndex + 1}</p>

                <div className="min-w-0">
                  {isEditing ? (
                    <input className={editInputClass} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} />
                  ) : (
                    <p className="truncate font-black text-slate-950">{member.name}</p>
                  )}
                </div>

                <div className="min-w-0">
                  {isEditing ? (
                    <input className={editInputClass} onChange={(event) => setDraft((current) => ({ ...current, team: event.target.value }))} placeholder="Team / Partner" value={draft.team} />
                  ) : (
                    <p className="truncate font-bold text-slate-600">{member.team || "-"}</p>
                  )}
                </div>

                <div className="flex min-w-0 items-center gap-2 font-semibold text-slate-700">
                  <Mail className="size-4 shrink-0 text-slate-400" />
                  <span className="truncate">{member.email}</span>
                </div>

                <div className="min-w-0">
                  {isEditing ? (
                    <select className={editInputClass} onChange={(event) => setDraft((current) => ({ ...current, designation: event.target.value }))} value={draft.designation}>
                      <option value="">Select role</option>
                      {roleOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                      {draft.designation && !roleOptions.includes(draft.designation) ? (
                        <option value={draft.designation}>{draft.designation}</option>
                      ) : null}
                    </select>
                  ) : (
                    <p className="truncate font-bold text-slate-700">{member.designation}</p>
                  )}
                </div>

                <div className="min-w-0">
                  {isEditing ? (
                    <input className={editInputClass} onChange={(event) => setDraft((current) => ({ ...current, joining_date: event.target.value }))} type="date" value={draft.joining_date} />
                  ) : (
                    <p className="truncate font-bold text-slate-600">{formatDate(member.joining_date)}</p>
                  )}
                </div>

                {isEditing ? (
                  <input className={editInputClass} onChange={(event) => setDraft((current) => ({ ...current, leaving_date: event.target.value }))} type="date" value={draft.leaving_date} />
                ) : (
                  <p className="truncate font-bold text-slate-600">{formatDate(member.leaving_date || getLeavingDate(member))}</p>
                )}

                <div className="flex items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                        disabled={isSaving}
                        onClick={() => void saveEdit(member.id)}
                        title="Save"
                        type="button"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        disabled={isSaving}
                        onClick={cancelEdit}
                        title="Cancel"
                        type="button"
                      >
                        <X className="size-4" />
                      </button>
                    </>
                  ) : canEdit ? (
                    <button
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-black uppercase text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      disabled={Boolean(editingId)}
                      onClick={() => startEdit(member)}
                      type="button"
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-slate-300">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const editInputClass =
  "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-800 outline-none transition focus:border-navy-400";

function SortableHeader({ activeKey, direction, label, onSort, sortKey }: { activeKey: SortKey; direction: SortDirection; label: string; onSort: (key: SortKey) => void; sortKey: SortKey }) {
  const Icon = activeKey !== sortKey ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      aria-label={`Sort by ${label}`}
      aria-pressed={activeKey === sortKey}
      className="flex items-center gap-1 text-left transition hover:text-slate-900"
      onClick={() => onSort(sortKey)}
      type="button"
    >
      <span>{label}</span>
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function getLeavingDate(member: { designation: string; joining_date: string }) {
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

function toDateInputValue(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
