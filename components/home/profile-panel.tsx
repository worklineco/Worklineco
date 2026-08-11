"use client";

import { supabase } from "@/lib/supabase/client";
import { clearWorkspaceCache, getCurrentUser } from "@/lib/supabase/session";
import { clearDataCache } from "@/lib/data-cache";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useWorklineEscape } from "@/components/layout/global-escape-closer";

type Profile = {
  email: string;
  name: string;
  role: string;
  team: string;
};

export function ProfilePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    email: "",
    name: "",
    role: "",
    team: ""
  });
  const [isSigningOut, setIsSigningOut] = useState(false);

  useWorklineEscape(() => setIsOpen(false), isOpen);

  useEffect(() => {
    getCurrentUser().then((user) => {
      const metadata = user?.user_metadata ?? {};

      setProfile({
        email: user?.email ?? "",
        name: String(metadata.full_name ?? metadata.name ?? ""),
        role: String(metadata.role ?? ""),
        team: String(metadata.team ?? "")
      });
    });
  }, []);

  async function signOut() {
    setIsSigningOut(true);
    clearWorkspaceCache();
    clearDataCache();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div>
      <button
        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-slate-700 transition hover:bg-white hover:text-slate-950 hover:shadow-sm"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
          <UserRound className="size-4" />
        </span>
        <span className="min-w-0 flex-1">Profile</span>
        <ChevronDown className={`size-4 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen ? (
        <div className="mt-2 rounded-2xl border border-slate-950/10 bg-white p-3 shadow-sm ring-1 ring-white/70">
          <p className="truncate text-sm font-black text-slate-950">{profile.name || "WorkLine User"}</p>
          <div className="mt-3 space-y-2 text-xs font-bold text-slate-600">
            <ProfileLine label="Team" value={profile.team || "-"} />
            <ProfileLine label="Email" value={profile.email || "-"} />
            {profile.role ? <ProfileLine label="Role" value={profile.role} /> : null}
          </div>
          <button
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-navy-700 px-3 text-xs font-black uppercase text-white transition hover:bg-navy-800 disabled:bg-slate-500"
            disabled={isSigningOut}
            onClick={signOut}
            type="button"
          >
            <LogOut className="size-3.5" />
            {isSigningOut ? "Logging out" : "Logout"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ProfileLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-slate-800">{value}</p>
    </div>
  );
}
