"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  Building2,
  FileSpreadsheet,
  CalendarDays,
  CalendarClock,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  ReceiptText,
  Scale,
  Trash2,
  UsersRound,
  Wrench,
  X
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { clearWorkspaceCache, getCurrentUser } from "@/lib/supabase/session";
import { clearDataCache, getCached, setCached } from "@/lib/data-cache";
import { JoiningDatePrompt } from "@/components/layout/joining-date-prompt";

type NavItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/partner-dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/gst", icon: ClipboardCheck, label: "GST Tracker" },
  { href: "/taskline-overview", icon: ListChecks, label: "TaskLine" },
  { href: "/gstr-9-9c", icon: FileSpreadsheet, label: "GSTR - 9 9C" },
  { href: "/non-litigation", icon: ListChecks, label: "Non-Litigation" },
  { href: "/taskline", icon: ListChecks, label: "Litigation" },
  { href: "/gstat", icon: Scale, label: "GSTAT" },
  { href: "/cestat", icon: Scale, label: "CESTAT" },
  { href: "/high-court", icon: Scale, label: "High Court" },
  { href: "/billing", icon: ReceiptText, label: "Billing" },
  { href: "/meeting-room", icon: CalendarDays, label: "Meeting Room" },
  { href: "/tools", icon: Wrench, label: "Tools" },
  { href: "/dco-policies", icon: BookOpenCheck, label: "DCo Policies" },
  { href: "/client-records", icon: Building2, label: "Client Records" },
  { href: "/teams", icon: UsersRound, label: "Team Members" },
  { href: "/sj-appointments", icon: CalendarClock, label: "SJ Appointments" },
  { href: "/gstat/trash", icon: Trash2, label: "Trash" }
];

const bareRoutePrefixes = ["/login", "/onboarding", "/auth"];

// Same designation list as the Teams register editor.
const profileRoleOptions = ["Article Assistant", "Associate", "Senior Associate", "Manager", "Senior Manager", "Partner", "Accounts", "Others"];
// Saving goes through the Teams register API, which only these roles may use.
const profileEditorRoles = ["partner", "others"];

type ProfileEditorDraft = { designation: string; joining_date: string; leaving_date: string; name: string; team: string };

function toProfileDateInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// The Team dropdown lists every team already on the Team Members register.
function buildTeamOptions(members: { team?: string; teams?: string[] }[]) {
  const unique = new Map<string, string>();

  for (const member of members) {
    for (const team of [member.team ?? "", ...(member.teams ?? [])]) {
      const display = String(team).trim();

      if (display) {
        unique.set(display.toLowerCase(), unique.get(display.toLowerCase()) ?? display);
      }
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
const collapseStorageKey = "wl_sidebar_collapsed";
const sjAppointmentEmails = new Set(["jatinshah.dco@gmail.com", "somya.dco@gmail.com"]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState("");
  const [profileTeam, setProfileTeam] = useState("");
  const [profileJoining, setProfileJoining] = useState("");
  const [profileLeaving, setProfileLeaving] = useState("");
  const [profileEditor, setProfileEditor] = useState<ProfileEditorDraft | null>(null);
  const [profileEditorMessage, setProfileEditorMessage] = useState("");
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileTeamOptions, setProfileTeamOptions] = useState<string[]>([]);

  useEffect(() => {
    if (window.localStorage.getItem(collapseStorageKey) === "1") {
      setCollapsed(true);
    }

    void getCurrentUser().then((user) => {
      const metadata = user?.user_metadata ?? {};
      setProfileName(String(metadata.full_name ?? metadata.name ?? user?.email ?? ""));
      setProfileEmail(String(user?.email ?? "").trim().toLowerCase());
      setProfileRole(String(metadata.role ?? ""));
      setProfileUserId(String(user?.id ?? ""));
      setProfileTeam(String(metadata.team ?? ""));
      setProfileJoining(String(metadata.joining_date ?? ""));
      setProfileLeaving(String(metadata.leaving_date ?? ""));
    });
  }, []);

  const canEditProfile = Boolean(profileUserId) && profileEditorRoles.includes(profileRole.trim().toLowerCase());

  async function loadProfileTeamOptions() {
    const cached = getCached<{ members?: { team?: string; teams?: string[] }[] }>("teams:members:v1");

    if (cached?.members?.length) {
      setProfileTeamOptions(buildTeamOptions(cached.members));
      return;
    }

    try {
      const response = await fetch("/api/teams", { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as { members?: { team?: string; teams?: string[] }[] };

      if (response.ok) {
        setCached("teams:members:v1", result);
        setProfileTeamOptions(buildTeamOptions(result.members ?? []));
      }
    } catch {
      // The dropdown still shows the current team; options just stay empty.
    }
  }

  function openProfileEditor() {
    setProfileEditorMessage("");
    void loadProfileTeamOptions();
    setProfileEditor({
      designation: profileRole.trim(),
      joining_date: toProfileDateInput(profileJoining),
      leaving_date: toProfileDateInput(profileLeaving),
      name: profileName,
      team: profileTeam
    });
  }

  async function saveProfileEditor() {
    if (!profileEditor || !profileUserId) {
      return;
    }

    setIsProfileSaving(true);
    setProfileEditorMessage("");

    try {
      const response = await fetch("/api/teams", {
        body: JSON.stringify({ id: profileUserId, ...profileEditor }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setProfileEditorMessage(result.error ?? "Could not save your details.");
        return;
      }

      setProfileName(profileEditor.name.trim() || profileName);
      setProfileRole(profileEditor.designation.trim() || profileRole);
      setProfileTeam(profileEditor.team.trim());
      setProfileJoining(profileEditor.joining_date);
      setProfileLeaving(profileEditor.leaving_date);
      setProfileEditor(null);
    } catch (error) {
      console.error("Profile save error:", error);
      setProfileEditorMessage("Could not save your details.");
    } finally {
      setIsProfileSaving(false);
    }
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Every control on the site shows a small hover message: buttons with a
  // hand-written title keep it, and the rest fall back to their aria-label
  // or visible text so no button is left unexplained.
  useEffect(() => {
    function addHoverTitle(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest('button, [role="button"], a[href]') : null;

      if (!target || target.getAttribute("title")) {
        return;
      }

      const text = (target.getAttribute("aria-label") ?? target.textContent ?? "").replace(/\s+/g, " ").trim();

      if (text) {
        target.setAttribute("title", text.length > 90 ? `${text.slice(0, 89)}...` : text);
      }
    }

    document.addEventListener("mouseover", addHoverTitle);
    return () => document.removeEventListener("mouseover", addHoverTitle);
  }, []);

  const isBareRoute = bareRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isBareRoute) {
    return <>{children}</>;
  }

  const isArticleAssistant = profileRole.trim().toLowerCase() === "article assistant";
  const visibleNav = navItems.filter(
    (item) =>
      !(isArticleAssistant && item.href === "/billing") &&
      (item.href !== "/sj-appointments" || sjAppointmentEmails.has(profileEmail))
  );

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(collapseStorageKey, next ? "1" : "0");
      return next;
    });
  }

  async function signOut() {
    setIsSigningOut(true);
    clearWorkspaceCache();
    clearDataCache();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function isActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-navy-700 text-white lg:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className={`flex px-3 py-4 ${collapsed ? "flex-col items-center gap-3" : "items-center gap-3"}`}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-500 text-sm font-semibold">
            WL
          </div>
          {!collapsed ? (
            <div className="flex-1 truncate text-[15px] font-semibold tracking-wide">WorkLine Co</div>
          ) : null}
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-1.5 text-navy-100 transition hover:bg-white/10 hover:text-white"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand" : "Collapse"}
            type="button"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        <nav className="wl-sidebar-scroll flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                className={`flex items-center rounded-lg px-3 py-2.5 text-sm transition ${
                  collapsed ? "justify-center" : "gap-3"
                } ${
                  active
                    ? "bg-white font-semibold text-navy-700"
                    : "text-navy-100 hover:bg-white/10 hover:text-white"
                }`}
                href={item.href}
                key={item.href}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="size-[18px] shrink-0" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          {!collapsed ? (
            <div className="mb-2 flex min-w-0 items-center gap-1.5 px-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{profileName || "Account"}</p>
                {profileRole ? <p className="truncate text-xs text-navy-200">{profileRole}</p> : null}
              </div>
              {canEditProfile ? (
                <button
                  aria-label="Edit your details"
                  className="shrink-0 rounded-md p-1.5 text-navy-200 transition hover:bg-white/10 hover:text-white"
                  onClick={openProfileEditor}
                  title="Update your basic details (name, team, designation, dates)"
                  type="button"
                >
                  <Pencil className="size-3.5" />
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-60"
            disabled={isSigningOut}
            onClick={signOut}
            title="Log out"
            type="button"
          >
            <LogOut className="size-4" />
            {!collapsed ? (isSigningOut ? "Signing out..." : "Log out") : null}
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-navy-700 text-white shadow-2xl">
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-500 text-sm font-semibold">
                WL
              </div>
              <div className="flex-1 truncate text-[15px] font-semibold tracking-wide">WorkLine Co</div>
              <button
                aria-label="Close menu"
                className="rounded-md p-1.5 text-navy-100 transition hover:bg-white/10 hover:text-white"
                onClick={() => setMobileOpen(false)}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav className="wl-sidebar-scroll flex-1 space-y-1 overflow-y-auto px-3 pb-4">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      active
                        ? "bg-white font-semibold text-navy-700"
                        : "text-navy-100 hover:bg-white/10 hover:text-white"
                    }`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon className="size-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-white/10 px-3 py-4">
              {profileName ? (
                <div className="mb-2 flex min-w-0 items-center gap-1.5 px-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{profileName}</p>
                    {profileRole ? <p className="truncate text-xs text-navy-200">{profileRole}</p> : null}
                  </div>
                  {canEditProfile ? (
                    <button
                      aria-label="Edit your details"
                      className="shrink-0 rounded-md p-1.5 text-navy-200 transition hover:bg-white/10 hover:text-white"
                      onClick={() => { setMobileOpen(false); openProfileEditor(); }}
                      title="Update your basic details (name, team, designation, dates)"
                      type="button"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}
              <button
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-60"
                disabled={isSigningOut}
                onClick={signOut}
                type="button"
              >
                <LogOut className="size-4" />
                {isSigningOut ? "Signing out..." : "Log out"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-40 flex items-center gap-3 bg-navy-700 px-4 py-3 text-white lg:hidden">
          <button
            aria-label="Open menu"
            className="rounded-md p-1 transition hover:bg-white/10"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu className="size-6" />
          </button>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy-500 text-xs font-semibold">
            WL
          </div>
          <span className="text-sm font-semibold tracking-wide">WorkLine Co</span>
        </div>
        {children}
      </div>
      {profileEditor ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-navy-950/55 p-4">
          <button
            aria-label="Close profile editor"
            className="absolute inset-0 cursor-default"
            onClick={() => setProfileEditor(null)}
            type="button"
          />
          <section className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-navy-700">My details</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">Update basic details</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">Changes save to the Team Members register.</p>
              </div>
              <button
                aria-label="Close"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                onClick={() => setProfileEditor(null)}
                title="Close"
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>

            {profileEditorMessage ? <p className="mt-3 text-sm font-bold text-red-600">{profileEditorMessage}</p> : null}

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Name</span>
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-navy-400"
                  onChange={(event) => setProfileEditor((current) => (current ? { ...current, name: event.target.value } : current))}
                  value={profileEditor.name}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Team</span>
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-navy-400"
                  onChange={(event) => setProfileEditor((current) => (current ? { ...current, team: event.target.value } : current))}
                  value={profileEditor.team}
                >
                  <option value="">Select team</option>
                  {profileTeamOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                  {profileEditor.team && !profileTeamOptions.includes(profileEditor.team) ? (
                    <option value={profileEditor.team}>{profileEditor.team}</option>
                  ) : null}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Designation</span>
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-navy-400"
                  onChange={(event) => setProfileEditor((current) => (current ? { ...current, designation: event.target.value } : current))}
                  value={profileEditor.designation}
                >
                  <option value="">Select role</option>
                  {profileRoleOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                  {profileEditor.designation && !profileRoleOptions.includes(profileEditor.designation) ? (
                    <option value={profileEditor.designation}>{profileEditor.designation}</option>
                  ) : null}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-500">Joining Date</span>
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-navy-400"
                    onChange={(event) => setProfileEditor((current) => (current ? { ...current, joining_date: event.target.value } : current))}
                    type="date"
                    value={profileEditor.joining_date}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-500">Leaving Date</span>
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-navy-400"
                    onChange={(event) => setProfileEditor((current) => (current ? { ...current, leaving_date: event.target.value } : current))}
                    type="date"
                    value={profileEditor.leaving_date}
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setProfileEditor(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-10 items-center justify-center rounded-lg bg-navy-700 px-4 text-sm font-black text-white transition hover:bg-navy-800 disabled:opacity-50"
                disabled={isProfileSaving}
                onClick={() => void saveProfileEditor()}
                type="button"
              >
                {isProfileSaving ? "Saving..." : "Save details"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <JoiningDatePrompt />
    </div>
  );
}
