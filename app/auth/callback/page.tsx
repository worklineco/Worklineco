import Link from "next/link";

export default function AuthCallbackPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(217,70,239,0.16),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.18),transparent_34%)]" />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center">
        <div className="w-full rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-300 via-sky-400 to-fuchsia-400 text-sm font-black text-slate-950">
            WL
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-navy-700">
            Email confirmed
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950">
            Your WorkLine account is ready.
          </h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
            Please sign in with the email and password you used during signup.
            After this, we will create the organisation setup flow.
          </p>
          <Link
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:bg-slate-800"
            href="/login"
          >
            Continue to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
