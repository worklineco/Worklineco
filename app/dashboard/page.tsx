import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 " />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center">
        <div className="w-full rounded-[30px] border border-white/80 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Workspace ready
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-slate-950">
            GST compliance workspace.
          </h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
            We are prioritising GST client tracking first: GSTINs, return
            periods, due dates, filing status, ARN, and portal/import source.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["GST Client Tracker", "Due Date Monitor", "Filing Status"].map((item) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700" key={item}>
                {item}
              </div>
            ))}
          </div>
          <Link
            className="mt-7 inline-flex h-12 items-center justify-center rounded-2xl bg-navy-700 px-5 text-sm font-black text-white"
            href="/gst"
          >
            Open GST Tracker
          </Link>
        </div>
      </section>
    </main>
  );
}
