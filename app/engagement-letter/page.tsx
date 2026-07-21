import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { EngagementLetterDashboard } from "@/components/engagement-letter/engagement-letter-dashboard";

export default function EngagementLetterPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 " />

      <section className="mx-auto w-full max-w-none">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-cyan-100 px-3 py-1.5 text-xs font-black uppercase text-cyan-800">
                <FileText className="size-3.5" />
                Engagement Letter
              </div>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">
                Engagement Letter Dashboard
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Save standard engagement formats by category, collect client details, and generate a ready draft from one workspace.
              </p>
            </div>

            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy-700 px-4 text-sm font-black text-white"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Workspace
            </Link>
          </div>
        </header>

        <EngagementLetterDashboard />
      </section>
    </main>
  );
}
