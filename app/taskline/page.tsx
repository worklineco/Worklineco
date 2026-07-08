import { ArrowLeft, ListChecks } from "lucide-react";
import Link from "next/link";

export default function TaskLinePage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(244,63,94,0.14),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(20,184,166,0.14),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.14),transparent_34%)]" />

      <section className="mx-auto max-w-[1540px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1.5 text-xs font-black uppercase text-rose-800">
                <ListChecks className="size-3.5" />
                TaskLine
              </div>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">
                TaskLine
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Track assignments, follow-ups, due dates, and ownership for day-to-day work.
              </p>
            </div>

            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Workspace
            </Link>
          </div>
        </header>

        <section className="mt-5 rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-800">
            <ListChecks className="size-7" />
          </div>
          <h2 className="mt-5 text-2xl font-black text-slate-950">Task workspace coming soon</h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            This area is ready for the TaskLine register, status views, and team responsibility tracking.
          </p>
        </section>
      </section>
    </main>
  );
}
