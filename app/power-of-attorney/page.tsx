import { ArrowLeft, ScrollText } from "lucide-react";
import Link from "next/link";

export default function PowerOfAttorneyPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(245,158,11,0.14),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(99,102,241,0.12),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(20,184,166,0.12),transparent_34%)]" />

      <section className="mx-auto max-w-[1540px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black uppercase text-amber-800">
                <ScrollText className="size-3.5" />
                Power of Attorney
              </div>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">Power of Attorney</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Workspace ready for Power of Attorney formats, drafts, and generated records.
              </p>
            </div>

            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
              href="/tools"
            >
              <ArrowLeft className="size-4" />
              Tools
            </Link>
          </div>
        </header>

        <section className="mt-5 rounded-[28px] border border-dashed border-slate-300 bg-white/80 p-6 text-sm font-semibold leading-6 text-slate-600">
          Power of Attorney formats can be added here.
        </section>
      </section>
    </main>
  );
}
