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
      className="min-h-screen overflow-x-hidden bg-[#f4f6fa] px-3 py-3 text-slate-950 sm:px-4 lg:h-screen lg:min-h-0 lg:overflow-hidden"
      data-ui="border-refresh"
    >
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 " />
        <div className="absolute inset-0  bg-[size:48px_48px]" />
      </div>

      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-7xl items-center gap-5 rounded-[28px] border border-slate-950/10 bg-white/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ring-1 ring-white/65 backdrop-blur-sm lg:h-[calc(100vh-1.5rem)] lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-4">
        <section className="py-3 lg:min-h-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-black uppercase text-navy-800 shadow-sm backdrop-blur">
            <Sparkles className="size-3.5 text-fuchsia-600" />
            WorkLine Co
          </div>

          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.05] text-slate-950 xl:text-5xl">
            Your firm's command center, ready when the workday starts.
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600 xl:text-base">
            A focused workspace for compliance, client records, team ownership,
            and deadline visibility, built for professional firms that move with
            discipline and detail.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {accessHighlights.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  className="workline-panel rounded-2xl p-3"
                  key={item.label}
                >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-navy-700 text-white">
                    <Icon className="size-4" />
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-950">{item.label}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{item.value}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid max-w-2xl gap-3 rounded-[22px] border border-slate-950 bg-navy-700 p-3 text-white shadow-[0_20px_55px_rgba(15,23,42,0.22)] ring-1 ring-white/20 sm:grid-cols-[auto_1fr] sm:p-4">
            <div className="flex size-11 items-center justify-center rounded-xl bg-navy-700 text-white">
              <Building2 className="size-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-black uppercase text-navy-100">
                  DCO workspace
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300 px-2.5 py-1 text-[11px] font-black uppercase text-emerald-950">
                  <BadgeCheck className="size-3" />
                  Verified access
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-5 text-slate-200">
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
