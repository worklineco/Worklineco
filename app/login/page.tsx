import { ArrowRight, Megaphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main
      className="min-h-screen overflow-x-hidden bg-[#f4f6fa] px-3 py-3 text-slate-950 sm:px-4 lg:h-screen lg:min-h-0 lg:overflow-hidden"
      data-ui="border-refresh"
    >
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-7xl items-center gap-5 rounded-[28px] border border-slate-950/10 bg-white/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ring-1 ring-white/65 backdrop-blur-sm lg:h-[calc(100vh-1.5rem)] lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-4">
        <section className="flex h-full flex-col justify-center py-3 lg:min-h-0">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-black uppercase text-navy-800 shadow-sm backdrop-blur">
            <Sparkles className="size-3.5 text-fuchsia-600" />
            WorkLine Co
          </div>

          <Link
            className="group relative mt-5 block overflow-hidden rounded-[32px] bg-gradient-to-br from-amber-400 via-fuchsia-500 to-violet-700 p-8 text-white shadow-[0_30px_80px_rgba(126,34,206,0.45)] ring-1 ring-white/30 transition hover:shadow-[0_36px_96px_rgba(126,34,206,0.6)] sm:p-10"
            href="/gst-council"
          >
            {/* decorative glows */}
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

              <span className="block text-5xl font-black leading-[1.02] tracking-tight drop-shadow-sm sm:text-6xl xl:text-7xl">
                57th GST Council
              </span>

              <span className="block max-w-xl text-lg font-bold leading-7 text-white/95 sm:text-xl">
                Key reforms &amp; agenda from the latest meeting. Open to everyone — no login needed.
              </span>

              <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-base font-black text-violet-700 shadow-lg transition group-hover:gap-3.5">
                View the updates
                <ArrowRight className="size-5 transition group-hover:translate-x-1" />
              </span>
            </span>
          </Link>
        </section>

        <LoginForm />
      </div>
    </main>
  );
}
