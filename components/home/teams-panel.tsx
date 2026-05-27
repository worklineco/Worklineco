"use client";

import { Mail, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

type TeamMember = {
  designation: string;
  email: string;
  id: string;
  name: string;
  team: string;
};

export function TeamsPanel() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black uppercase text-white transition hover:bg-slate-800 disabled:bg-slate-500"
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
          <div className="grid min-w-[680px] grid-cols-[1.2fr_1.4fr_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-500">
            <span>Name</span>
            <span>Email ID</span>
            <span>Designation</span>
          </div>

          {isLoading ? (
            <p className="px-4 py-5 text-sm font-bold text-slate-500">Loading team members...</p>
          ) : null}

          {!isLoading && message ? (
            <p className="px-4 py-5 text-sm font-bold text-red-600">{message}</p>
          ) : null}

          {!isLoading && !message && members.length === 0 ? (
            <p className="px-4 py-5 text-sm font-bold text-slate-500">No team members found.</p>
          ) : null}

          {!isLoading && !message && members.map((member) => (
            <div
              className="grid min-w-[680px] grid-cols-[1.2fr_1.4fr_1fr] gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
              key={member.id}
            >
              <div className="min-w-0">
                <p className="truncate font-black text-slate-950">{member.name}</p>
                {member.team ? <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{member.team}</p> : null}
              </div>
              <div className="flex min-w-0 items-center gap-2 font-semibold text-slate-700">
                <Mail className="size-4 shrink-0 text-slate-400" />
                <span className="truncate">{member.email}</span>
              </div>
              <p className="truncate font-bold text-slate-700">{member.designation}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
