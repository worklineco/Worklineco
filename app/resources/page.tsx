import { ArrowLeft, ArrowRight, LayoutDashboard, Megaphone, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata = {
  description: "Resource Center — curated resources and references from Dhadda & Co.",
  title: "Resource Center — WorkLine Co"
};

// Newest resources go FIRST. Mark the latest one with `isNew` so it shows the
// NEW highlight. To publish a new resource, add it to the top of this list.
const resources = [
  {
    blurb: "A living board of our latest resources, references and working notes — open to everyone.",
    cta: "Open the board",
    gradient: "from-navy-800 via-navy-700 to-sky-600",
    href: "/resources/board",
    icon: LayoutDashboard,
    isNew: true,
    key: "board",
    title: "Resource Board"
  },
  {
    blurb: "Key reforms and agenda from the latest meeting. Open to everyone — no login needed.",
    cta: "View the updates",
    gradient: "from-sky-600 via-blue-700 to-navy-800",
    href: "/gst-council",
    icon: Megaphone,
    isNew: false,
    key: "gst-council",
    title: "57th GST Council"
  }
];

export default function ResourceCenterPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#eef1f8] via-white to-[#eaf1fb] text-slate-950">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white/80 px-4 py-2 backdrop-blur">
        <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-navy-800">
          <span className="flex size-6 items-center justify-center rounded-md bg-navy-700 text-white">
            <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24">
              <path d="M4 16l5-5 3 3 7-8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 6h5v5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Dhadda &amp; Co. · WorkLine
        </span>
        <Link
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-black text-navy-700 transition hover:bg-slate-100"
          href="/login"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </Link>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-navy-800 shadow-sm">
          <Sparkles className="size-3.5 text-sky-600" />
          Resource Center
        </span>
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-navy-900 sm:text-5xl">
          Resources &amp; references, in one place
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600 sm:text-base">
          Everything we publish for clients and the team — the newest additions appear first.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {resources.map((resource) => {
            const Icon = resource.icon;
            return (
              <Link
                className={`group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[28px] bg-gradient-to-br ${resource.gradient} p-7 text-white shadow-[0_24px_60px_rgba(30,58,138,0.32)] ring-1 ring-white/20 transition hover:shadow-[0_30px_76px_rgba(30,58,138,0.48)]`}
                href={resource.href}
                key={resource.key}
              >
                <span className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-white/25 blur-3xl" />

                <span className="relative flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/40 backdrop-blur">
                    <Icon className="size-6" />
                  </span>
                  {resource.isNew ? (
                    <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-sky-300 px-3 py-1 text-xs font-black uppercase tracking-wide text-navy-900 shadow">
                      <Sparkles className="size-3.5" />
                      New
                    </span>
                  ) : null}
                </span>

                <span className="relative mt-5 block">
                  <span className="block text-3xl font-black leading-tight tracking-tight drop-shadow-sm sm:text-4xl">{resource.title}</span>
                  <span className="mt-2 block max-w-md text-sm font-bold leading-6 text-white/95">{resource.blurb}</span>
                </span>

                <span className="relative mt-5 inline-flex w-fit items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-black text-navy-800 shadow-lg transition group-hover:gap-3.5">
                  {resource.cta}
                  <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
