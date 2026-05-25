import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(217,70,239,0.16),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.18),transparent_34%)]" />
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_440px]">
        <section>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase text-teal-700 shadow-sm">
            WorkLine Co access
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
            Sign in to the operating layer for your firm.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            The first production path is simple: email as user ID, password for
            authentication, one organisation per user, and permissions resolved
            from configurable roles.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["Custom roles", "Tenant isolation", "Audit-ready"].map((item) => (
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 text-sm font-bold text-slate-700 shadow-sm" key={item}>
                {item}
              </div>
            ))}
          </div>
        </section>

        <LoginForm />
      </div>
    </main>
  );
}
