"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  ReceiptText,
  Scale,
  Trash2,
  Wrench
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { clearWorkspaceCache, getCurrentUser } from "@/lib/supabase/session";
import { clearDataCache } from "@/lib/data-cache";

type NavItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/partner-dashboard", icon: BriefcaseBusiness, label: "Partner Dashboard" },
  { href: "/gst", icon: ClipboardCheck, label: "GST Tracker" },
  { href: "/gstat", icon: Scale, label: "GSTAT" },
  { href: "/billing", icon: ReceiptText, label: "Billing" },
  { href: "/meeting-room", icon: CalendarDays, label: "Meeting Room" },
  { href: "/taskline", icon: ListChecks, label: "TaskLine" },
  { href: "/tools", icon: Wrench, label: "Tools" },
  { href: "/dco-policies", icon: BookOpenCheck, label: "DCo Policies" },
  { href: "/applause-board", icon: Megaphone, label: "Applause Board" },
  { href: "/client-records", icon: Building2, label: "Client Records" },
  { href: "/gstat/trash", icon: Trash2, label: "Trash" }
];

// Routes that should render without the app chrome (sidebar).
const bareRoutePrefixes = ["/login", "/onboarding", "/auth"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [profileName, setProfileName] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    void getCurrentUser().then((user) => {
      const metadata = user?.user_metadata ?? {};
      setProfileName(String(metadata.full_name ?? metadata.name ?? user?.email ?? ""));
      setProfileRole(String(metadata.role ?? ""));
    });
  }, []);

  const isBareRoute = bareRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isBareRoute) {
    return <>{children}</>;
  }

  const isArticleAssistant = profileRole.trim().toLowerCase() === "article assistant";
  const visibleNav = navItems.filter((item) => !(isArticleAssistant && item.href === "/billing"));

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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-navy-700 text-white lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-navy-500 text-sm font-semibold">
            WL
          </div>
          <div className="text-[15px] font-semibold tracking-wide">WorkLine Co</div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
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
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <div className="mb-2 min-w-0">
            <p className="truncate text-sm font-semibold">{profileName || "Account"}</p>
            {profileRole ? <p className="truncate text-xs text-navy-200">{profileRole}</p> : null}
          </div>
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

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
