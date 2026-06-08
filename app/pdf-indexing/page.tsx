import { ArrowLeft, FileSearch } from "lucide-react";
import Link from "next/link";

export default function PdfIndexingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f3ea] px-2 py-3 text-slate-950 sm:px-3 lg:px-4">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(99,102,241,0.16),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(20,184,166,0.14),transparent_26%),radial-gradient(circle_at_48%_92%,rgba(245,158,11,0.14),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <section className="mx-auto w-full max-w-none">
        <header className="workline-frame rounded-[20px] p-4 md:p-5">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-slate-950/10 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-700 shadow-sm"
            href="/"
          >
            <ArrowLeft className="size-3.5" />
            Workspace
          </Link>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-300 via-sky-300 to-teal-300 text-slate-950">
              <FileSearch className="size-7" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-700">
                Document workspace
              </p>
              <h1 className="mt-1 text-4xl font-black leading-tight text-slate-950">PDF & Indexing</h1>
            </div>
          </div>
        </header>
      </section>
    </main>
  );
}
