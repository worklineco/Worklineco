import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata = {
  description: "57th GST Council Meeting — key reforms and agenda.",
  title: "57th GST Council Meeting — WorkLine Co"
};

export default function GstCouncilPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#f4f6fa]">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
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
      </header>

      <div className="flex-1 px-2 pb-4 sm:px-4">
        <iframe
          className="h-[calc(100vh-5rem)] w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
          src="/gst-council-artifact.html"
          title="57th GST Council Meeting"
        />
      </div>
    </main>
  );
}
