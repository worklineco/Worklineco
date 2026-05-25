import {
  Activity,
  Archive,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpenText,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Files,
  Gavel,
  IndianRupee,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wand2
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

const modules = [
  { name: "Dashboard", status: "Live", group: "Foundation", icon: LayoutDashboard, color: "teal" },
  { name: "Client Master", status: "Next", group: "Core records", icon: Building2, color: "blue" },
  { name: "GST Tracker", status: "Live", group: "Compliance", icon: ClipboardCheck, color: "amber" },
  { name: "Attendance", status: "Planned", group: "People", icon: CalendarClock, color: "violet" },
  { name: "Team Master", status: "Next", group: "People", icon: UsersRound, color: "coral" },
  { name: "Task & Work Allocation", status: "Next", group: "Operations", icon: Activity, color: "green" },
  { name: "Billing & Fee Realisation", status: "Planned", group: "Finance", icon: IndianRupee, color: "gold" },
  { name: "Meeting Room Allocation", status: "Planned", group: "Operations", icon: Archive, color: "slate" },
  { name: "File Management", status: "Planned", group: "Documents", icon: Files, color: "blue" },
  { name: "Litigation Management", status: "Future", group: "Legal", icon: Gavel, color: "coral" },
  { name: "Drafting & Ground Library", status: "Future", group: "AI knowledge", icon: BookOpenText, color: "violet" },
  { name: "WhatsApp Intake", status: "Future", group: "Intake", icon: MessageCircle, color: "green" },
  { name: "Email Intake", status: "Future", group: "Intake", icon: Mail, color: "blue" },
  { name: "Notice Tracking", status: "Future", group: "Compliance", icon: FileSearch, color: "amber" },
  { name: "Analytics & Productivity", status: "Future", group: "Insights", icon: BarChart3, color: "teal" },
  { name: "User & Role Management", status: "Live", group: "Foundation", icon: ShieldCheck, color: "violet" }
];

const setupSteps = [
  { label: "GitHub repository", done: true },
  { label: "Supabase project", done: true },
  { label: "Vercel deployment", done: true },
  { label: "GoDaddy domain DNS", done: true },
  { label: "Authentication and RBAC", done: false },
  { label: "Client, team, task MVP", done: false }
];

const quickStats = [
  { label: "Domain", value: "Live", tone: "bg-emerald-100 text-emerald-800" },
  { label: "Modules", value: "16", tone: "bg-sky-100 text-sky-800" },
  { label: "MVP Spine", value: "6", tone: "bg-amber-100 text-amber-800" },
  { label: "Tenancy", value: "Strict", tone: "bg-fuchsia-100 text-fuchsia-800" }
];

const nextActions = [
  "Create password login",
  "Create organisation setup",
  "Add custom roles",
  "Build GST tracker"
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbf7ef] text-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(20,184,166,0.16),transparent_30%),radial-gradient(circle_at_82%_14%,rgba(244,114,182,0.18),transparent_28%),radial-gradient(circle_at_58%_88%,rgba(250,204,21,0.16),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <div className="mx-auto flex w-full max-w-[1480px] gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 rounded-[18px] border border-white/70 bg-white/75 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur lg:block">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-950 p-3 text-white">
            <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 via-sky-400 to-fuchsia-400 text-sm font-black text-slate-950">
              WL
            </div>
            <div>
              <p className="text-sm font-black">WorkLine Co</p>
              <p className="text-xs text-slate-300">Firm operating system</p>
            </div>
          </div>

          <nav className="mt-5 space-y-1.5">
            {modules.slice(0, 8).map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-slate-950 hover:shadow-sm"
                  href={module.name === "GST Tracker" ? "/gst" : "#modules"}
                  key={module.name}
                >
                  <span className={`flex size-8 items-center justify-center rounded-lg ${iconTone(module.color)}`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{module.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-5 rounded-2xl bg-gradient-to-br from-teal-600 via-sky-600 to-indigo-700 p-4 text-white">
            <Sparkles className="size-5" />
            <p className="mt-3 text-sm font-bold">AI-native later, workflow-first now.</p>
            <p className="mt-1 text-xs leading-5 text-sky-50">
              Clean data and permissions first. Drafting intelligence becomes powerful after that.
            </p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="rounded-[22px] border border-white/70 bg-white/80 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur md:p-7">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase text-emerald-800">
                    Live at worklineco.com
                  </span>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-800">
                    Foundation build
                  </span>
                </div>
                <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
                  A lively command center for professional firm operations.
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
                  WorkLine Co will give each organisation its own flexible roles,
                  hierarchy, workflows, billing controls, compliance trackers,
                  document intelligence, and AI-assisted drafting layer.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5"
                    href="/login"
                  >
                    Start login build
                    <ArrowRight className="size-4" />
                  </Link>
                  <a
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:-translate-y-0.5"
                    href="#modules"
                  >
                    View module map
                  </a>
                </div>
              </div>

              <div className="grid min-w-full grid-cols-2 gap-3 sm:min-w-[420px] sm:grid-cols-4 xl:min-w-[520px]">
                {quickStats.map((stat) => (
                  <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm" key={stat.label}>
                    <p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${stat.tone}`}>
                      {stat.value}
                    </p>
                    <p className="mt-3 text-xs font-black uppercase text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </header>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_0.85fr]">
            <section
              className="rounded-[22px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur md:p-6"
              id="modules"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">
                    Product architecture
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950">Module Map</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    The ERP tabs are grouped by business function, with room for
                    future modules without crowding the main navigation.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
                  <Wand2 className="size-4 text-fuchsia-600" />
                  Configurable by organisation
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {modules.map((module) => {
                  const Icon = module.icon;
                  return (
                    <Link
                      href={module.name === "GST Tracker" ? "/gst" : "#modules"}
                      className="group min-h-36 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                      key={module.name}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className={`flex size-11 items-center justify-center rounded-2xl ${iconTone(module.color)}`}>
                          <Icon className="size-5" />
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone(module.status)}`}>
                          {module.status}
                        </span>
                      </div>
                      <h3 className="mt-5 text-sm font-black leading-5 text-slate-950">
                        {module.name}
                      </h3>
                      <p className="mt-2 text-xs font-bold text-slate-500">{module.group}</p>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="space-y-5">
              <Panel title="Build Track" icon={CheckCircle2}>
                <div className="space-y-3">
                  {setupSteps.map((item, index) => (
                    <div className="flex items-center gap-3" key={item.label}>
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                          item.done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {item.done ? "✓" : index + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-600">{item.label}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Security Spine" icon={LockKeyhole}>
                <div className="grid gap-3">
                  {[
                    "One user, one organisation",
                    "Custom hierarchy and roles",
                    "Strict permission keys",
                    "RLS-protected tenant data",
                    "Payment suspension gates",
                    "Audit logs for sensitive actions"
                  ].map((item) => (
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Next Actions" icon={Bell}>
                <div className="grid gap-2">
                  {nextActions.map((item) => (
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3" key={item}>
                      <span className="size-2 rounded-full bg-gradient-to-r from-teal-400 to-fuchsia-500" />
                      <span className="text-sm font-bold text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({
  children,
  icon: Icon,
  title
}: {
  children: ReactNode;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section className="rounded-[22px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-black text-slate-950">{title}</h2>
        <span className="flex size-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
          <Icon className="size-5" />
        </span>
      </div>
      {children}
    </section>
  );
}

function iconTone(color: string) {
  const tones: Record<string, string> = {
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-sky-100 text-sky-800",
    coral: "bg-rose-100 text-rose-800",
    gold: "bg-yellow-100 text-yellow-800",
    green: "bg-emerald-100 text-emerald-800",
    slate: "bg-slate-100 text-slate-700",
    teal: "bg-teal-100 text-teal-800",
    violet: "bg-fuchsia-100 text-fuchsia-800"
  };

  return tones[color] ?? tones.teal;
}

function statusTone(status: string) {
  const tones: Record<string, string> = {
    Future: "bg-slate-100 text-slate-600",
    Live: "bg-emerald-100 text-emerald-800",
    Next: "bg-sky-100 text-sky-800",
    Planned: "bg-amber-100 text-amber-800"
  };

  return tones[status] ?? tones.Planned;
}
