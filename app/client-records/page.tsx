import { ClientRecordsRegister } from "@/components/client-records/client-records-register";

export default function ClientRecordsPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6fa] px-2 py-3 text-slate-950 sm:px-3 lg:px-4">
      <div className="pointer-events-none fixed inset-0 -z-10 " />

      <section className="mx-auto w-full max-w-none">
        <ClientRecordsRegister />
      </section>
    </main>
  );
}

