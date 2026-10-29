import { ArrowLeft, ArrowRight, Archive, LayoutDashboard, Megaphone, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata = {
  description: "Resource Center — curated resources and references from Dhadda & Co.",
  title: "Resource Center — WorkLine Co"
};

// The latest resource is featured at the top. Older editions live under Archives.
const featured = {
  gradient: "from-navy-800 via-navy-700 to-sky-600",
  href: "/resources/board",
  icon: LayoutDashboard,
  title: "Compendium on Amendments in pursuance of 57th GST Council Meeting"
};

const archives = [
  {
    gradient: "from-sky-600 via-blue-700 to-navy-800",
    href: "/gst-council",
    icon: Megaphone,
    key: "gst-council-57",
    title: "57th GST Council"
  },
  {
    gradient: "from-navy-700 via-blue-800 to-sky-700",
    href: "/resources/gst-council-56",
    icon: Megaphone,
    key: "gst-council-56",
    title: "56th GST Council"
  }
];

export default function ResourceCenterPage() {
  const FeaturedIcon = featured.icon;
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-[#eef1f8] via-white to-[#eaf1fb] text-slate-950">
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

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-7 sm:px-8 sm:py-9">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-navy-800 shadow-sm">
            <Sparkles className="size-3.5 text-sky-600" />
            Resource Center
          </span>
          <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight text-navy-900 sm:text-5xl">
            Resources &amp; references, in one place
          </h1>
        </div>

        {/* Featured (latest) */}
        <Link
          className={`group relative mt-6 flex flex-1 min-h-[260px] flex-col justify-between overflow-hidden rounded-[28px] bg-gradient-to-br ${featured.gradient} p-8 text-white shadow-[0_24px_60px_rgba(30,58,138,0.32)] ring-1 ring-white/20 transition hover:shadow-[0_30px_76px_rgba(30,58,138,0.48)] sm:p-10`}
          href={featured.href}
        >
          <span className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/20 blur-3xl" />
          <span className="pointer-events-none absolute -bottom-20 -left-10 size-64 rounded-full bg-sky-400/25 blur-3xl" />

          <span className="relative flex items-center gap-3">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
              <FeaturedIcon className="size-7" />
            </span>
            <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-sky-300 px-4 py-1.5 text-sm font-black uppercase tracking-wide text-navy-900 shadow">
              <Sparkles className="size-4" />
              New
            </span>
          </span>

          <span className="relative mt-5 block text-4xl font-black leading-[1.05] tracking-tight drop-shadow-sm sm:text-5xl xl:text-6xl">
            {featured.title}
          </span>

          <span className="relative mt-5 inline-flex w-fit items-center gap-2 rounded-2xl bg-white px-6 py-3 text-base font-black text-navy-800 shadow-lg transition group-hover:gap-3.5">
            Open the compendium
            <ArrowRight className="size-5 transition group-hover:translate-x-1" />
          </span>
        </Link>

        {/* Archives */}
        <p className="mt-7 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          <Archive className="size-4 text-slate-400" />
          Archives
        </p>
        <div className="mt-3 grid flex-1 min-h-[180px] gap-5 sm:grid-cols-2">
          {archives.map((resource) => {
            const Icon = resource.icon;
            return (
              <Link
                className={`group relative flex min-h-[170px] flex-col justify-between overflow-hidden rounded-[24px] bg-gradient-to-br ${resource.gradient} p-6 text-white shadow-[0_20px_50px_rgba(30,58,138,0.28)] ring-1 ring-white/20 transition hover:shadow-[0_26px_66px_rgba(30,58,138,0.42)]`}
                href={resource.href}
                key={resource.key}
              >
                <span className="pointer-events-none absolute -right-14 -top-14 size-40 rounded-full bg-white/15 blur-3xl" />
                <span className="relative flex size-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
                  <Icon className="size-5" />
                </span>
                <span className="relative mt-4 block text-2xl font-black leading-tight tracking-tight drop-shadow-sm sm:text-3xl">
                  {resource.title}
                </span>
                <span className="relative mt-4 inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-navy-800 shadow-lg transition group-hover:gap-3">
                  Open
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
