import {
  ArrowRight,
  BarChart3,
  Building2,
  ClipboardCheck,
  FileText,
  Gavel,
  LayoutDashboard,
  Scale,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

const navigation = [
  { href: "/", icon: LayoutDashboard, label: "Overview", tone: "bg-teal-100 text-teal-800" },
  { href: "/gst", icon: ClipboardCheck, label: "GST Tracker", tone: "bg-amber-100 text-amber-800" },
  { href: "#gstat", icon: Scale, label: "GSTAT", tone: "bg-fuchsia-100 text-fuchsia-800" },
  { href: "#records", icon: Building2, label: "Client Records", tone: "bg-sky-100 text-sky-800" },
  { href: "#reports", icon: BarChart3, label: "Reports", tone: "bg-emerald-100 text-emerald-800" }
];

const productFocus = [
  {
    action: "Open tracker",
    description: "Track GSTINs, return periods, filing status, due dates, ARN details, and portal source in one focused workspace.",
    href: "/gst",
    icon: ClipboardCheck,
    label: "Live workspace",
    title: "GST Tracker",
    tone: "from-amber-300 via-orange-300 to-rose-300"
  },
  {
    action: "Prepare workspace",
    description: "GSTAT matters, appeal stages, hearing dates, documents, and action ownership will sit here as the next priority.",
    href: "#gstat",
    icon: Scale,
    label: "Now building",
    title: "GSTAT",
    tone: "from-teal-300 via-sky-300 to-fuchsia-300"
  }
];

const supportingAreas = [
  { icon: Building2, label: "Client Records", text: "A clean master for firm clients and identifiers." },
  { icon: FileText, label: "Documents", text: "Organised filing material and working papers." },
  { icon: Gavel, label: "Litigation", text: "Matter movement and responsibility tracking." }
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f3ea] text-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(20,184,166,0.18),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(244,114,182,0.16),transparent_28%),radial-gradient(circle_at_55%_90%,rgba(245,158,11,0.14),transparent_34%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="mx-auto grid w-full max-w-[1440px] gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[280px_1fr] lg:px-8">
        <aside className="workline-frame hidden rounded-[22px] p-4 lg:block">
          <div className="rounded-2xl border border-white/15 bg-slate-950 p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 via-sky-300 to-fuchsia-300 text-sm font-black text-slate-950">
                WL
              </div>
              <div>
                <p className="text-sm font-black">WorkLine Co</p>
                <p className="text-xs font-semibold text-slate-300">Professional workspace</p>
              </div>
            </div>
          </div>

          <nav className="mt-5 space-y-1.5">
            {navigation.map((item) => (
              <NavItem item={item} key={item.label} />
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="workline-frame rounded-[26px] p-5 md:p-7">
            <div className="grid gap-6 xl:grid-cols-[1fr_360px] xl:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black uppercase text-emerald-800">
                  <ShieldCheck className="size-3.5" />
                  WorkLine Co workspace
                </div>
                <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
                  Compliance work, client records, and tribunal matters in one calm workspace.
                </h1>
                <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-slate-600">
                  Start with GST and GSTAT. Keep the firm focused on filings,
                  hearings, documents, and responsibility without exposing internal
                  build notes or administrative clutter.
                </p>
              </div>

              <div className="rounded-3xl border border-white/15 bg-slate-950 p-5 text-white shadow-[0_18px_50px_rgba(15,23,42,0.20)]">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-200">
                  Current priority
                </p>
                <h2 className="mt-3 text-3xl font-black">GST + GSTAT</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                  The compliance and appeals workspace is the primary product surface.
                </p>
              </div>
            </div>
          </header>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            {productFocus.map((item) => (
              <ProductCard item={item} key={item.title} />
            ))}
          </section>

          <section className="workline-frame mt-5 rounded-[26px] p-5 md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">
                  Product areas
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Supporting Workspace</h2>
              </div>
              <p className="max-w-xl text-sm font-semibold leading-6 text-slate-600">
                Only the modules useful to day-to-day professional service work are shown here.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3" id="records">
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
                    <h3 className="mt-4 text-base font-black text-slate-950">{item.label}</h3>
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

function NavItem({
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
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-white hover:text-slate-950 hover:shadow-sm"
      href={item.href}
    >
      <span className={`flex size-9 items-center justify-center rounded-xl ${item.tone}`}>
        <Icon className="size-4" />
      </span>
      <span>{item.label}</span>
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
    title: string;
    tone: string;
  };
}) {
  const Icon = item.icon;

  return (
    <Link
      className="workline-panel group rounded-[26px] p-5 transition hover:-translate-y-1 hover:shadow-[0_30px_90px_rgba(15,23,42,0.16)] md:p-6"
      href={item.href}
      id={item.title === "GSTAT" ? "gstat" : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.tone} text-slate-950`}>
          <Icon className="size-7" />
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black uppercase text-slate-700">
          {item.label}
        </span>
      </div>
      <h2 className="mt-6 text-3xl font-black text-slate-950">{item.title}</h2>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{item.description}</p>
      <div className="mt-6 inline-flex items-center gap-2 text-sm font-black text-slate-950">
        {item.action}
        <ArrowRight className="size-4 transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
