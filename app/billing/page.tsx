import { ReceiptText } from "lucide-react";
import Link from "next/link";

export default function BillingPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(132,204,22,0.16),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.16),transparent_34%)]" />

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center">
        <div className="w-full rounded-[30px] border border-white/80 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
          <div className="inline-flex items-center gap-2 rounded-full bg-lime-100 px-3 py-1.5 text-xs font-black uppercase text-lime-800">
            <ReceiptText className="size-3.5" />
            Billing
          </div>
          <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">
            Billing workspace.
          </h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            This tab is ready for invoices, payment follow-up, client billing
            records, and fee tracking when the workflow is defined.
          </p>
          <Link
            className="mt-7 inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
            href="/"
          >
            Back to workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
