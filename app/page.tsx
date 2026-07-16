"use client";

import {
  ArrowRight,
  BarChart3,
  Building2,
  BriefcaseBusiness,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  Wrench,
  FileText,
  Gavel,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  ReceiptText,
  Scale,
  ShieldCheck,
  Trash2,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MonthCalendar } from "@/components/home/month-calendar";
import { ProfilePanel } from "@/components/home/profile-panel";
import { TeamsPanel } from "@/components/home/teams-panel";
import { getCurrentUser } from "@/lib/supabase/session";

const navigation = [
  { href: "/", icon: LayoutDashboard, label: "Overview", tone: "bg-navy-100 text-navy-800" },
  { href: "/partner-dashboard", icon: BriefcaseBusiness, label: "Partner Dashboard", tone: "bg-violet-100 text-violet-800" },
  { href: "/gst", icon: ClipboardCheck, label: "GST Tracker", tone: "bg-amber-100 text-amber-800" },
  { href: "/gstat", icon: Scale, label: "GSTAT", tone: "bg-fuchsia-100 text-fuchsia-800" },
  { href: "/billing", icon: ReceiptText, label: "Billing", tone: "bg-lime-100 text-lime-800" },
  { href: "/meeting-room", icon: CalendarDays, label: "Meeting Room", tone: "bg-cyan-100 text-cyan-800" },
  { href: "/taskline", icon: ListChecks, label: "TaskLine", tone: "bg-rose-100 text-rose-800" },
  { href: "/tools", icon: Wrench, label: "Tools", tone: "bg-indigo-100 text-indigo-800" },
  { href: "/dco-policies", icon: BookOpenCheck, label: "DCo Policies", tone: "bg-blue-100 text-blue-800" },
  { href: "/applause-board", icon: Megaphone, label: "Applause Board", tone: "bg-pink-100 text-pink-800" },
  { href: "/client-records", icon: Building2, label: "Client Records", tone: "bg-sky-100 text-sky-800" },
  { href: "#reports", icon: BarChart3, label: "Reports", tone: "bg-emerald-100 text-emerald-800" },
  { href: "/gstat/trash", icon: Trash2, label: "Trash", tone: "bg-emerald-100 text-emerald-800" }
];

const productFocus = [
  {
    action: "Open tracker",
    description: "Track GSTINs, return periods, filing status, due dates, ARN details, and portal source in one focused workspace.",
    href: "/gst",
    icon: ClipboardCheck,
    label: "Tracker",
    target: "_blank",
    title: "GST Tracker",
    tone: "from-amber-300 via-orange-300 to-rose-300"
  },
  {
    action: "Open register",
    description: "Manage appeal stages, hearing dates, documents, billing links, and action ownership for GSTAT matters.",
    href: "/gstat",
    icon: Scale,
    label: "Now live",
    target: "_blank",
    title: "GSTAT",
    tone: "from-navy-300 via-sky-300 to-fuchsia-300"
  },
  {
    action: "Open billing",
    description: "Maintain firm-wide billing, GSTAT links, receiving status, audit trail, imports, and trash recovery.",
    href: "/billing",
    icon: ReceiptText,
    label: "Firm-wide",
    target: "_blank",
    title: "Billing",
    tone: "from-lime-200 via-emerald-200 to-navy-300"
  },
  {
    action: "Book a room",
    description: "Reserve meeting rooms by floor, prevent clashes, and keep the day board visible for office scheduling.",
    href: "/meeting-room",
    icon: CalendarDays,
    label: "Office",
    target: "_blank",
    title: "Meeting Room",
    tone: "from-cyan-200 via-sky-200 to-indigo-200"
  }
];

const supportingAreas = [
  { icon: Building2, label: "Client Records", text: "Central client master for GSTIN, registration, contacts, and billing lookup." },
  { icon: FileText, label: "Documents", text: "Reusable formats, filing material, and working papers." },
  { icon: Gavel, label: "Litigation", text: "Matter movement, responsibility tracking, and billing linkage." },
  { icon: ListChecks, label: "Tasks", text: "Daily follow-ups, team ownership, and operating discipline." }
];

export default function Home() {
  const [isTeamsVisible, setIsTeamsVisible] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const teamsPanelRef = useRef<HTMLDivElement>(null);
  const dashboardLabel = useMemo(() => {
    const firstName = profileName.trim().split(/\s+/)[0];

    return firstName ? `${firstName}'s Dashboard` : "Partner Dashboard";
  }, [profileName]);
  const isArticleAssistant = profileRole.trim().toLowerCase() === "article assistant";
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => !(isArticleAssistant && item.href === "/billing")),
    [isArticleAssistant]
  );
  const visibleProductFocus = useMemo(
    () => productFocus.filter((item) => !(isArticleAssistant && item.href === "/billing")),
    [isArticleAssistant]
  );

  useEffect(() => {
    getCurrentUser().then((user) => {
      const metadata = user?.user_metadata ?? {};
      setProfileName(String(metadata.full_name ?? metadata.name ?? user?.email ?? ""));
      setProfileRole(String(metadata.role ?? ""));
    });
  }, []);

  function toggleTeams() {
    setIsTeamsVisible((current) => {
      const next = !current;

      if (next) {
        window.setTimeout(() => {
          teamsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 0);
      }

      return next;
    });
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6fa] text-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(20,184,166,0.05),transparent_45%)]" />
      </div>

      <div className="mx-auto grid w-full max-w-none gap-5 px-2 py-3 sm:px-3 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-4">
        <aside className="workline-frame hidden rounded-[22px] p-4 lg:block">
          <div className="rounded-2xl border border-white/15 bg-slate-950 p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-navy-600 text-sm font-bold text-white">
                WL
              </div>
              <div>
                <p className="text-sm font-bold">WorkLine Co</p>
                <p className="text-xs font-semibold text-slate-300">Professional workspace</p>
              </div>
            </div>
          </div>

          <nav className="mt-5 space-y-1.5">
            {visibleNavigation.map((item) => (
              <NavItem item={item.label === "Partner Dashboard" ? { ...item, label: dashboardLabel } : item} key={item.label} />
            ))}
            <NavButton
              icon={UsersRound}
              isActive={isTeamsVisible}
              label="Teams"
              onClick={toggleTeams}
            />
            <ProfilePanel />
          </nav>
        </aside>

        <section className="min-w-0">
          <nav className="workline-frame mb-5 flex gap-2 overflow-x-auto rounded-[22px] p-3 lg:hidden">
            {visibleNavigation.map((item) => (
              <MobileNavItem item={item.label === "Partner Dashboard" ? { ...item, label: dashboardLabel } : item} key={item.label} />
            ))}
          </nav>

          <header className="workline-frame rounded-[26px] p-5 md:p-7">
            <div className="grid gap-6 xl:grid-cols-[1fr_360px] xl:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold uppercase text-emerald-800">
                  <ShieldCheck className="size-3.5" />
                  WorkLine Co workspace
                </div>
                <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
                  A firm-wide operating workspace for matters, billing, clients, and office scheduling.
                </h1>
                <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600">
                  Run professional-service work from one place: client records, GST/GSTAT, billing, tasks, documents, and meeting room bookings.
                </p>
              </div>

              <div className="rounded-3xl border border-white/15 bg-slate-950 p-5 text-white shadow-[0_18px_50px_rgba(15,23,42,0.20)]">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-navy-200">
                  Current workspace
                </p>
                <h2 className="mt-3 text-3xl font-bold">Firm Operations</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                  WorkLine now brings compliance, litigation, billing, client master data, and office coordination into one product surface.
                </p>
              </div>
            </div>
          </header>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            {visibleProductFocus.map((item) => (
              <ProductCard item={item} key={item.title} />
            ))}
          </section>

          <MonthCalendar />

          {isTeamsVisible ? (
            <div ref={teamsPanelRef}>
              <TeamsPanel />
            </div>
          ) : null}

          <section className="workline-frame mt-5 rounded-[26px] p-5 md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-navy-700">
                  Product areas
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">Supporting Workspace</h2>
              </div>
              <p className="max-w-xl text-sm font-semibold leading-6 text-slate-600">
                Only the modules useful to day-to-day professional service work are shown here.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {supportingAreas.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    className="rounded-2xl border border-slate-950/10 bg-white p-4 shadow-sm ring-1 ring-white/70"
                    key={item.label}
                  >
                    <div className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
                      <Icon className="size-5" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-slate-950">{item.label}</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function MobileNavItem({
  item
}: {
  item: {
    href: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
    tone: string;
  };
}) {
  const Icon = item.icon;

  return (
    <Link
      className="flex min-w-max items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-950/5"
      href={item.href}
    >
      <span className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="size-3.5" />
      </span>
      {item.label}
    </Link>
  );
}

function NavButton({
  icon: Icon,
  isActive,
  label,
  onClick
}: {
  icon: ComponentType<{ className?: string }>;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-white hover:text-slate-950 hover:shadow-sm ${
        isActive ? "bg-white text-slate-950 shadow-sm" : "text-slate-700"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-navy-50 group-hover:text-navy-700">
        <Icon className="size-4" />
      </span>
      <span>{label}</span>
    </button>
  );
}

function NavItem({
  item
}: {
  item: {
    href: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
    status?: string;
    target?: string;
    tone: string;
  };
}) {
  const Icon = item.icon;

  return (
    <Link
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-slate-950 hover:shadow-sm"
      href={item.href}
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-navy-50 group-hover:text-navy-700">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate">{item.label}</span>
        {item.status ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase leading-4 text-emerald-800 ring-1 ring-emerald-200">
            {item.status}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function ProductCard({
  item
}: {
  item: {
    action: string;
    description: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
    target?: string;
    title: string;
    tone: string;
  };
}) {
  const Icon = item.icon;

  return (
    <Link
      className="workline-panel group rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.10)] md:p-6"
      href={item.href}
      id={item.title === "GSTAT" ? "gstat" : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-navy-50 text-navy-700 ring-1 ring-navy-100">
          <Icon className="size-7" />
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
          item.label === "Now live" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
        }`}>
          {item.label}
        </span>
      </div>
      <h2 className="mt-6 text-3xl font-bold text-slate-950">{item.title}</h2>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{item.description}</p>
      <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-slate-950">
        {item.action}
        <ArrowRight className="size-4 transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
