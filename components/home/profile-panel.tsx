"use client";

import { supabase } from "@/lib/supabase/client";
import { LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type Profile = {
  email: string;
  name: string;
  role: string;
  team: string;
};

export function ProfilePanel() {
  const [profile, setProfile] = useState<Profile>({
    email: "",
    name: "",
    role: "",
    team: ""
  });
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
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
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <section className="workline-frame mt-5 rounded-[26px] p-5 md:p-6" id="profile">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <UserRound className="size-6" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Profile</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{profile.name || "WorkLine User"}</h2>
          </div>
        </div>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-500"
          disabled={isSigningOut}
          onClick={signOut}
          type="button"
        >
          <LogOut className="size-4" />
          {isSigningOut ? "Logging out" : "Logout"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <ProfileField label="Name" value={profile.name || "-"} />
        <ProfileField label="Team" value={profile.team || "-"} />
        <ProfileField label="Email" value={profile.email || "-"} />
      </div>
      {profile.role ? (
        <p className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black uppercase text-slate-700">
          {profile.role}
        </p>
      ) : null}
    </section>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-950/10 bg-white p-4 shadow-sm ring-1 ring-white/70">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}
