import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(217,70,239,0.16),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.18),transparent_34%)]" />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center">
        <div className="w-full rounded-[30px] border border-white/80 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Workspace ready
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-slate-950">
            Organisation foundation created.
          </h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
            Next we will replace this with the authenticated dashboard: clients,
            tasks, team, billing state, and configurable role controls.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Client Master", "Team Master", "Task Allocation"].map((item) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700" key={item}>
                {item}
              </div>
            ))}
          </div>
          <Link
            className="mt-7 inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
            href="/"
          >
            Back to public shell
          </Link>
        </div>
      </section>
    </main>
  );
}
