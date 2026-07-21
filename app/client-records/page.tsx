import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ClientRecordsRegister } from "@/components/client-records/client-records-register";

export default function ClientRecordsPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 " />

      <section className="mx-auto w-full max-w-none">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black text-slate-950">Client Records</h1>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-navy-700 px-4 text-sm font-black text-white"
            href="/"
          >
            <ArrowLeft className="size-4" />
            Workspace
          </Link>
        </header>

        <div className="mt-4">
          <ClientRecordsRegister />
        </div>
      </section>
    </main>
  );
}
