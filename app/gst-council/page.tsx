import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata = {
  description: "57th GST Council Meeting — key reforms and agenda.",
  title: "57th GST Council Meeting — WorkLine Co"
};

export default function GstCouncilPage() {
  return (
    <main className="flex h-screen flex-col bg-[#f4f6fa]">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-navy-800">
          <Sparkles className="size-3 text-fuchsia-600" />
          WorkLine Co
        </span>
        <Link
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-black text-navy-700 transition hover:bg-slate-100"
          href="/login"
        >
          <ArrowLeft className="size-3" />
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
