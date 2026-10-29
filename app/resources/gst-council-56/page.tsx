import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  description: "GST Council's 56th Meeting — archive, from Dhadda & Co.",
  title: "56th GST Council Meeting — WorkLine Co"
};

export default function GstCouncil56Page() {
  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-[#f4f6fa]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1">
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

      <div className="relative min-h-0 flex-1">
        <iframe
          className="absolute inset-0 h-full w-full border-0 bg-white"
          src="/gst-council-56/index.html"
          title="56th GST Council Meeting"
        />
      </div>
    </main>
  );
}
