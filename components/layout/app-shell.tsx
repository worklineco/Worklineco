"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  Building2,
  FileSignature,
  CalendarDays,
  CalendarClock,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Scale,
  Trash2,
  UsersRound,
  Wrench,
  X
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { clearWorkspaceCache, getCurrentUser } from "@/lib/supabase/session";
import { clearDataCache } from "@/lib/data-cache";
import { JoiningDatePrompt } from "@/components/layout/joining-date-prompt";

type NavItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/partner-dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/gst", icon: ClipboardCheck, label: "GST Tracker" },
  { href: "/gstat", icon: Scale, label: "GSTAT" },
  { href: "/billing", icon: ReceiptText, label: "Billing" },
  { href: "/meeting-room", icon: CalendarDays, label: "Meeting Room" },
  { href: "/taskline", icon: ListChecks, label: "TaskLine" },
  { href: "/tools", icon: Wrench, label: "Tools" },
  { href: "/dco-policies", icon: BookOpenCheck, label: "DCo Policies" },
  { href: "/applause-board", icon: Megaphone, label: "Applause Board" },
  { href: "/client-records", icon: Building2, label: "Client Records" },
  { href: "/engagement-letters", icon: FileSignature, label: "Engagement Letters" },
  { href: "/teams", icon: UsersRound, label: "Team Members" },
  { href: "/sj-appointments", icon: CalendarClock, label: "SJ Appointments" },
  { href: "/gstat/trash", icon: Trash2, label: "Trash" }
];

const bareRoutePrefixes = ["/login", "/onboarding", "/auth"];
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

  useEffect(() => {
    if (window.localStorage.getItem(collapseStorageKey) === "1") {
      setCollapsed(true);
    }

    void getCurrentUser().then((user) => {
      const metadata = user?.user_metadata ?? {};
      setProfileName(String(metadata.full_name ?? metadata.name ?? user?.email ?? ""));
      setProfileEmail(String(user?.email ?? "").trim().toLowerCase());
      setProfileRole(String(metadata.role ?? ""));
    });
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
            <div className="mb-2 min-w-0 px-1">
              <p className="truncate text-sm font-semibold">{profileName || "Account"}</p>
              {profileRole ? <p className="truncate text-xs text-navy-200">{profileRole}</p> : null}
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
                <div className="mb-2 min-w-0 px-1">
                  <p className="truncate text-sm font-semibold">{profileName}</p>
                  {profileRole ? <p className="truncate text-xs text-navy-200">{profileRole}</p> : null}
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
      <JoiningDatePrompt />
    </div>
  );
}
