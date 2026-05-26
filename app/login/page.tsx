import { LoginForm } from "@/components/auth/login-form";
import { BadgeCheck, Building2, Clock3, FileText, ShieldCheck, Sparkles } from "lucide-react";

const accessHighlights = [
  { icon: ShieldCheck, label: "Protected workspace", value: "Firm-only access" },
  { icon: Clock3, label: "Compliance rhythm", value: "Returns, tasks, deadlines" },
  { icon: FileText, label: "Matter clarity", value: "Clients and records aligned" }
];

export default function LoginPage() {
  return (
    <main
      className="min-h-screen overflow-hidden bg-[#f7f3ea] px-4 py-6 text-slate-950 sm:px-6 lg:px-8"
      data-ui="border-refresh"
    >
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.08),transparent_28%),radial-gradient(circle_at_18%_20%,rgba(20,184,166,0.22),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(244,114,182,0.20),transparent_24%),radial-gradient(circle_at_50%_88%,rgba(245,158,11,0.18),transparent_30%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(180deg,rgba(15,23,42,0.045)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-8 rounded-[34px] border border-slate-950/10 bg-white/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ring-1 ring-white/65 backdrop-blur-sm lg:grid-cols-[1fr_455px] lg:p-5">
        <section className="py-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-black uppercase text-teal-800 shadow-sm backdrop-blur">
            <Sparkles className="size-3.5 text-fuchsia-600" />
            WorkLine Co
          </div>

          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
            Your firm's command center, ready when the workday starts.
          </h1>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-slate-600">
            A focused workspace for compliance, client records, team ownership,
            and deadline visibility, built for professional firms that move with
            discipline and detail.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {accessHighlights.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  className="workline-panel rounded-2xl p-4"
                  key={item.label}
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                    <Icon className="size-4" />
                  </div>
                  <p className="mt-4 text-sm font-black text-slate-950">{item.label}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{item.value}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 grid max-w-2xl gap-3 rounded-[28px] border border-slate-950 bg-slate-950 p-4 text-white shadow-[0_28px_80px_rgba(15,23,42,0.24)] ring-1 ring-white/20 sm:grid-cols-[auto_1fr] sm:p-5">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300 via-sky-300 to-fuchsia-300 text-slate-950">
              <Building2 className="size-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-black uppercase text-teal-100">
                  DCO workspace
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300 px-2.5 py-1 text-[11px] font-black uppercase text-emerald-950">
                  <BadgeCheck className="size-3" />
                  Verified access
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-200">
                Sign in to continue work, or create a verified team account with
                organisation and team approval.
              </p>
            </div>
          </div>
        </section>

        <LoginForm />
      </div>
    </main>
  );
}
