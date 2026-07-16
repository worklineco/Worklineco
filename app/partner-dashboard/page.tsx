import { ArrowLeft, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";
import { PartnerDashboard } from "@/components/partner-dashboard/partner-dashboard";

export default function PartnerDashboardPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 " />

      <section className="mx-auto max-w-[1540px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-black uppercase text-violet-800">
                <BriefcaseBusiness className="size-3.5" />
                Partner Dashboard
              </div>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">
                Partner command dashboard
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Track priorities, notes, follow-ups, conversations, and meetings from one work surface.
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

        <PartnerDashboard />
      </section>
    </main>
  );
}
