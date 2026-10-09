import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata = {
  description: "57th GST Council Meeting — key reforms and agenda.",
  title: "57th GST Council Meeting — WorkLine Co"
};

export default function GstCouncilPage() {
  return (
    <main className="flex h-screen flex-col bg-[#f4f6fa]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase text-navy-800 shadow-sm">
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
      </header>

      <iframe
        className="w-full flex-1 min-h-0 border-0 bg-white"
        src="/gst-council-artifact.html"
        title="57th GST Council Meeting"
      />
    </main>
  );
}
