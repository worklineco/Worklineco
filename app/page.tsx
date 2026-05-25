import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  BookOpenText,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  Files,
  Gavel,
  Inbox,
  IndianRupee,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageCircle,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound
} from "lucide-react";

const modules = [
  { name: "Dashboard", status: "Foundation", icon: LayoutDashboard },
  { name: "Client Master", status: "MVP", icon: Building2 },
  { name: "GST Tracker", status: "Planned", icon: ClipboardCheck },
  { name: "Attendance", status: "Planned", icon: CalendarClock },
  { name: "Team Master", status: "MVP", icon: UsersRound },
  { name: "Task & Work Allocation", status: "MVP", icon: Activity },
  { name: "Billing & Fee Realisation", status: "Planned", icon: IndianRupee },
  { name: "Meeting Room Allocation", status: "Planned", icon: Archive },
  { name: "File Management", status: "Planned", icon: Files },
  { name: "Litigation Management", status: "Future", icon: Gavel },
  { name: "Drafting & Ground Library", status: "Future", icon: BookOpenText },
  { name: "WhatsApp Intake", status: "Future", icon: MessageCircle },
  { name: "Email Intake", status: "Future", icon: Mail },
  { name: "Notice Tracking", status: "Future", icon: FileSearch },
  { name: "Analytics & Productivity", status: "Future", icon: BarChart3 },
  { name: "User & Role Management", status: "Foundation", icon: ShieldCheck }
];

const foundation = [
  "One user belongs to one organisation",
  "Organisation-defined hierarchy and role names",
  "Permission keys remain internal and controlled",
  "Subscription state can restrict or suspend access",
  "Every operational table carries organisation_id",
  "Audit logs capture sensitive changes"
];

const setupSteps = [
  "GitHub repository",
  "Supabase project",
  "Vercel deployment",
  "GoDaddy domain DNS",
  "Authentication and RBAC",
  "Client, team, task MVP"
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 rounded-md border border-line bg-white/80 p-4 shadow-panel lg:block">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-ink text-sm font-bold text-white">
              WL
            </div>
            <div>
              <p className="text-sm font-bold">WorkLine Co</p>
              <p className="text-xs text-moss">Operating layer</p>
            </div>
          </div>
          <nav className="mt-5 space-y-1">
            {modules.slice(0, 8).map((module) => {
              const Icon = module.icon;
              return (
                <a
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink hover:bg-paper"
                  href="#modules"
                  key={module.name}
                >
                  <Icon className="size-4 text-teal" />
                  <span>{module.name}</span>
                </a>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex flex-col gap-4 rounded-md border border-line bg-white/90 p-5 shadow-panel md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-clay">
                Foundation workspace
              </p>
              <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">
                WorkLine Co control center
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-moss">
                A clean shell for a configurable ERP: organisations can shape
                their own teams, hierarchy, roles, statuses, and workflows while
                the platform keeps security, tenant isolation, and billing rules
                strict.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Modules" value="16" />
              <Metric label="Core MVP" value="6" />
              <Metric label="Tenancy" value="Strict" />
            </div>
          </header>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
            <section
              className="rounded-md border border-line bg-white/90 p-5 shadow-panel"
              id="modules"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-ink">Module Map</h2>
                  <p className="mt-1 text-sm text-moss">
                    Each tab is planned as an independent module attached to the
                    same organisation, permission, audit, and subscription spine.
                  </p>
                </div>
                <SlidersHorizontal className="size-5 shrink-0 text-brass" />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {modules.map((module) => {
                  const Icon = module.icon;
                  return (
                    <article
                      className="rounded-md border border-line bg-paper/55 p-4"
                      key={module.name}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Icon className="size-5 text-teal" />
                        <span className="rounded-sm border border-line bg-white px-2 py-1 text-[11px] font-bold text-moss">
                          {module.status}
                        </span>
                      </div>
                      <h3 className="mt-4 text-sm font-bold text-ink">
                        {module.name}
                      </h3>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="space-y-5">
              <Panel title="Architecture Rules" icon={LockKeyhole}>
                <ul className="space-y-3">
                  {foundation.map((item) => (
                    <li className="flex gap-3 text-sm text-moss" key={item}>
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-clay" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Setup Track" icon={Inbox}>
                <div className="space-y-3">
                  {setupSteps.map((item, index) => (
                    <div className="flex items-center gap-3" key={item}>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-paper text-xs font-bold text-ink">
                        {index + 1}
                      </span>
                      <span className="text-sm text-moss">{item}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Suspension Logic" icon={Bell}>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold text-ink">
                  {["trial", "active", "past_due", "restricted", "suspended", "cancelled"].map(
                    (state) => (
                      <span
                        className="rounded-md border border-line bg-paper px-3 py-2"
                        key={state}
                      >
                        {state}
                      </span>
                    )
                  )}
                </div>
              </Panel>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20 rounded-md border border-line bg-paper px-3 py-3">
      <p className="text-lg font-bold text-ink">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase text-moss">{label}</p>
    </div>
  );
}

function Panel({
  children,
  icon: Icon,
  title
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section className="rounded-md border border-line bg-white/90 p-5 shadow-panel">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <Icon className="size-5 text-brass" />
      </div>
      {children}
    </section>
  );
}
