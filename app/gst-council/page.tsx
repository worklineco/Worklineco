import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata = {
  description: "57th GST Council Meeting — key reforms and agenda.",
  title: "57th GST Council Meeting — WorkLine Co"
};

export default function GstCouncilPage() {
  return (
<<<<<<< HEAD
    <main className="flex min-h-screen flex-col bg-[#f4f6fa]">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-black uppercase text-navy-800 shadow-sm">
          <Sparkles className="size-3.5 text-fuchsia-600" />
          WorkLine Co
=======
    <main className="min-h-screen bg-[#f4f6fa] px-5 py-10 sm:px-8">
      <div className="w-full text-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-black uppercase text-navy-800 shadow-sm">
            <Sparkles className="size-3.5 text-fuchsia-600" />
            WorkLine Co
          </div>
          <Link
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-navy-700 shadow-sm transition hover:bg-slate-50"
            href="/login"
          >
            <ArrowLeft className="size-3.5" />
            Back to sign in
          </Link>
>>>>>>> 92c2de2660c81a7b7352f0bf1965bae9307ef89a
        </div>
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-navy-700 shadow-sm transition hover:bg-slate-50"
          href="/login"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </Link>
      </header>

<<<<<<< HEAD
      <div className="flex-1 px-2 pb-4 sm:px-4">
        <iframe
          className="h-[calc(100vh-5rem)] w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
          src="/gst-council-artifact.html"
          title="57th GST Council Meeting"
        />
=======
        <header className="mt-6 overflow-hidden rounded-3xl border border-navy-100 bg-gradient-to-br from-navy-700 to-navy-900 p-7 text-white shadow-lg">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1 text-[11px] font-black uppercase text-amber-950">
            Updated
          </span>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">57th GST Council Meeting</h1>
          <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-navy-100">
            <CalendarDays className="size-4" />
            7 October 2026 · New Delhi · Chaired by the Union Finance Minister
          </p>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-navy-100/90">
            Rescheduled from 12 September 2026 (New Delhi hosted the BRICS Leaders' Summit). The meeting was reported to
            focus on process reforms, with broad-based rate changes not expected to be taken up.
          </p>
        </header>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <p className="text-sm font-semibold leading-6 text-amber-900">
            These are the agenda items and reforms reported ahead of the meeting — not confirmed outcomes.
            Recommendations take legal effect only after the GST Council's official press release and government
            notifications. This page will be updated once the official recommendations are published.
          </p>
        </div>

        <section className="mt-6 grid gap-4 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          {sections.map((item) => (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={item.title}>
              <h2 className="text-sm font-black text-navy-800">{item.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-black text-navy-800">Sources</h2>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-navy-700">
            <li>
              <a className="underline hover:text-navy-900" href="https://taxguru.in/goods-and-service-tax/57th-gst-council-meeting-registration-itc-process-reforms-focus.html" rel="noreferrer" target="_blank">
                TaxGuru — 57th GST Council Meeting: Registration, ITC and Process Reforms in Focus
              </a>
            </li>
            <li>
              <a className="underline hover:text-navy-900" href="https://www.grantthornton.in/insights/articles/57th-gst-council-meeting/" rel="noreferrer" target="_blank">
                Grant Thornton — Six reforms that can define GST's second decade
              </a>
            </li>
            <li>
              <a className="underline hover:text-navy-900" href="https://www.pib.gov.in/" rel="noreferrer" target="_blank">
                PIB — official GST Council press releases (check for the 57th meeting recommendations)
              </a>
            </li>
          </ul>
          <p className="mt-3 text-xs font-semibold text-slate-400">Last reviewed 8 October 2026.</p>
        </section>
>>>>>>> 92c2de2660c81a7b7352f0bf1965bae9307ef89a
      </div>
    </main>
  );
}
