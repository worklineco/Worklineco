import { TaskLineRegister } from "@/components/taskline/taskline-register";

export default function TaskLinePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbf7ef] px-2 py-3 text-slate-950 sm:px-3 lg:px-4">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(244,63,94,0.14),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(20,184,166,0.14),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.14),transparent_34%)]" />

      <section className="mx-auto w-full max-w-none">
        <TaskLineRegister />
      </section>
    </main>
  );
}
