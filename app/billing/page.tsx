import { BillingRegister } from "@/components/billing/billing-register";

export default function BillingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6fa] px-2 py-3 text-slate-950 sm:px-3 lg:px-4">
      <div className="pointer-events-none fixed inset-0 -z-10 " />

      <section className="mx-auto w-full max-w-none">
        <div>
          <BillingRegister />
        </div>
      </section>
    </main>
  );
}
