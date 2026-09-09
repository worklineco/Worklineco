import { TaskLineRegister } from "@/components/taskline/taskline-register";

export default function CestatPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6fa] px-2 py-3 text-slate-950 sm:px-3 lg:px-4">
      <section className="mx-auto w-full max-w-none">
        <h1 className="mb-3 text-2xl font-black text-slate-950">CESTAT</h1>
        <TaskLineRegister registerKey="cestat" registerName="CESTAT" />
      </section>
    </main>
  );
}
