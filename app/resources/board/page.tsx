import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  description: "Resource Board — curated resources and references from Dhadda & Co.",
  title: "Resource Board — WorkLine Co"
};

// When the board's exported HTML is saved to /public/resource-board-artifact.html,
// replace the placeholder block below with:
//   <iframe className="w-full flex-1 min-h-0 border-0 bg-white" src="/resource-board-artifact.html" title="Resource Board" />
export default function ResourceBoardPage() {
  return (
    <main className="flex h-screen flex-col bg-[#f4f6fa]">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-navy-800">
          <span className="flex size-4 items-center justify-center rounded-[5px] bg-navy-700 text-white">
            <svg aria-hidden="true" className="size-2.5" fill="none" viewBox="0 0 24 24">
              <path d="M4 16l5-5 3 3 7-8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 6h5v5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          WorkLine Co
        </span>
        <Link
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-black text-navy-700 transition hover:bg-slate-100"
          href="/resources"
        >
          <ArrowLeft className="size-3" />
          Back to Resource Center
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-600">Coming soon</p>
          <h1 className="mt-2 text-2xl font-black text-navy-900">Resource Board is being prepared</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            This board will be published here shortly, open to everyone — no login needed.
          </p>
        </div>
      </div>
    </main>
  );
}
