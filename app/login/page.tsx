import { ArrowRight, Megaphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { LoginLauncher } from "@/components/auth/login-launcher";

function BrandMark({ className = "size-11" }: { className?: string }) {
  return (
    <span className={`flex ${className} items-center justify-center rounded-2xl bg-navy-700 text-white shadow-md`}>
      <svg aria-hidden="true" className="size-2/3" fill="none" viewBox="0 0 24 24">
        <path d="M4 16l5-5 3 3 7-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 6h5v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#eef1f8] via-white to-[#f3eefb] px-4 py-5 text-slate-950 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col">
        {/* Top bar: firm lockup + Login */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark className="size-12" />
            <div className="leading-tight">
              <p className="text-lg font-black tracking-tight text-navy-900">Dhadda &amp; Co.</p>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Chartered Accountants</p>
            </div>
          </div>
          <LoginLauncher />
        </header>

        {/* Hero */}
        <div className="my-auto grid items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-navy-800 shadow-sm">
              <Sparkles className="size-3.5 text-fuchsia-600" />
              The firm's command center
            </span>

            <h1 className="mt-5 text-6xl font-black leading-[0.95] tracking-tight text-navy-900 xl:text-7xl">Dhadda &amp; Co.</h1>
            <p className="mt-3 text-xl font-black uppercase tracking-[0.2em] text-slate-500">Chartered Accountants</p>

            <div className="mt-5 flex items-center gap-3">
              <BrandMark className="size-14" />
              <span className="bg-gradient-to-r from-navy-700 via-fuchsia-600 to-violet-700 bg-clip-text text-5xl font-black tracking-tight text-transparent xl:text-6xl">
                WorkLine
              </span>
            </div>

            <p className="mt-5 max-w-md text-sm font-semibold leading-6 text-slate-600">
              A single, secure workspace for task and work management, compliance, records, litigation tracking,
              and deadline visibility — built for the firm that moves with discipline and detail.
            </p>
          </section>

          {/* Flashy 57th GST Council banner */}
          <Link
            className="group relative flex h-full min-h-[340px] flex-col justify-center overflow-hidden rounded-[32px] bg-gradient-to-br from-amber-400 via-fuchsia-500 to-violet-700 p-8 text-white shadow-[0_30px_80px_rgba(126,34,206,0.45)] ring-1 ring-white/30 transition hover:shadow-[0_36px_96px_rgba(126,34,206,0.6)] sm:p-10"
            href="/gst-council"
          >
            <span className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/25 blur-3xl" />
            <span className="pointer-events-none absolute -bottom-20 -left-10 size-64 rounded-full bg-amber-300/40 blur-3xl" />

            <span className="relative flex flex-col gap-5">
              <span className="flex flex-wrap items-center gap-3">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/40 backdrop-blur">
                  <Megaphone className="size-7" />
                </span>
                <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-emerald-300 px-4 py-1.5 text-sm font-black uppercase tracking-wide text-emerald-950 shadow">
                  <Sparkles className="size-4" />
                  Updated
                </span>
              </span>

              <span className="block text-5xl font-black leading-[1.02] tracking-tight drop-shadow-sm sm:text-6xl xl:text-7xl">57th GST Council</span>

              <span className="block max-w-xl text-lg font-bold leading-7 text-white/95 sm:text-xl">
                Key reforms &amp; agenda from the latest meeting. Open to everyone — no login needed.
              </span>

              <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-base font-black text-violet-700 shadow-lg transition group-hover:gap-3.5">
                View the updates
                <ArrowRight className="size-5 transition group-hover:translate-x-1" />
              </span>
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
