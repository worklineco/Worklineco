import { BillingRegister } from "@/components/billing/billing-register";

export default function BillingPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(132,204,22,0.16),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.16),transparent_34%)]" />

      <section className="mx-auto max-w-[1540px]">
        <div>
          <BillingRegister />
        </div>
      </section>
    </main>
  );
}
