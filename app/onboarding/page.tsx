import Link from "next/link";

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(217,70,239,0.16),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.18),transparent_34%)]" />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center">
        <div className="w-full rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur sm:p-8">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300 via-sky-400 to-fuchsia-400 text-sm font-black text-slate-950">
            WL
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-teal-700">
            Organisation setup
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-slate-950">
            Your account is active. Next we create the firm workspace.
          </h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            The next build will collect organisation name, owner details,
            starting roles, hierarchy labels, and default task statuses.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              "Organisation profile",
              "Owner role",
              "Custom hierarchy",
              "Default workflow statuses"
            ].map((item) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700" key={item}>
                {item}
              </div>
            ))}
          </div>

          <Link
            className="mt-7 inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:bg-slate-800"
            href="/"
          >
            Back to control center
          </Link>
        </div>
      </section>
    </main>
  );
}
