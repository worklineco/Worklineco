import { TaskLineRegister } from "@/components/taskline/taskline-register";

export default function TaskLineOverviewPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6fa] px-2 py-3 text-slate-950 sm:px-3 lg:px-4">
      <section className="mx-auto w-full max-w-none">
        <h1 className="mb-1 text-2xl font-black text-slate-950">TaskLine</h1>
        <p className="mb-3 text-xs font-semibold text-slate-500">Core fields from Litigation, Non-Litigation, GSTAT, CESTAT and High Court in one read-only list.</p>
        <TaskLineRegister registerKey="all" registerName="TaskLine" />
      </section>
    </main>
  );
}
