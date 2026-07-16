"use client";

import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/supabase/session";
import { ArrowRight, Building2, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const defaultHierarchy = "Owner\nPartner\nManager\nSenior\nStaff";
const defaultStatuses = "Pending\nIn Progress\nWaiting for Client\nUnder Review\nCompleted";

export function OnboardingForm() {
  const [email, setEmail] = useState("");
  const [organisationName, setOrganisationName] = useState("");
  const [organisationType, setOrganisationType] = useState("CA firm");
  const [ownerName, setOwnerName] = useState("");
  const [ownerRoleName, setOwnerRoleName] = useState("Owner");
  const [hierarchyLabels, setHierarchyLabels] = useState(defaultHierarchy);
  const [taskStatuses, setTaskStatuses] = useState(defaultStatuses);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    getCurrentUser().then((user) => {
      setEmail(user?.email ?? "");
      setIsCheckingSession(false);
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    const { error } = await supabase.rpc("bootstrap_organisation", {
      p_hierarchy_labels: toList(hierarchyLabels),
      p_organisation_name: organisationName,
      p_organisation_type: organisationType,
      p_owner_name: ownerName,
      p_owner_role_name: ownerRoleName,
      p_task_statuses: toList(taskStatuses)
    });

    if (error) {
      setMessage(formatOnboardingError(error.message));
      setIsLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  if (isCheckingSession) {
    return (
      <Shell>
        <div className="rounded-[30px] border border-white/80 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
          <Loader2 className="size-6 animate-spin text-navy-700" />
          <p className="mt-4 text-sm font-bold text-slate-600">Checking your WorkLine session...</p>
        </div>
      </Shell>
    );
  }

  if (!email) {
    return (
      <Shell>
        <div className="rounded-[30px] border border-white/80 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
          <ShieldCheck className="size-8 text-navy-700" />
          <h1 className="mt-5 text-3xl font-black text-slate-950">Sign in required</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            Please sign in before creating your organisation workspace.
          </p>
          <Link
            className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
            href="/login"
          >
            Go to login
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="grid w-full max-w-6xl gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-300 via-sky-400 to-fuchsia-400 text-sm font-black text-slate-950">
            WL
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-navy-700">
            Organisation setup
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-slate-950">
            Create the firm workspace.
          </h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
            This creates the tenant record, links your user to it, gives you the
            first owner role, and saves initial workflow labels.
          </p>

          <div className="mt-6 space-y-3">
            {[
              "One user linked to one organisation",
              "Custom hierarchy labels",
              "Owner role created first",
              "Task statuses editable later"
            ].map((item) => (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700" key={item}>
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </aside>

        <form
          className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)]"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-700">
                Workspace details
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Foundation profile</h2>
            </div>
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-xs font-black text-sky-900">
              {email}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Organisation name">
              <input
                className="input"
                onChange={(event) => setOrganisationName(event.target.value)}
                placeholder="Example: DCO & Co."
                required
                value={organisationName}
              />
            </Field>

            <Field label="Organisation type">
              <select
                className="input"
                onChange={(event) => setOrganisationType(event.target.value)}
                value={organisationType}
              >
                <option>CA firm</option>
                <option>Litigation practice</option>
                <option>Compliance team</option>
                <option>Professional services firm</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Owner name">
              <input
                className="input"
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder="Your name"
                required
                value={ownerName}
              />
            </Field>

            <Field label="Owner role name">
              <input
                className="input"
                onChange={(event) => setOwnerRoleName(event.target.value)}
                placeholder="Owner"
                required
                value={ownerRoleName}
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Hierarchy labels">
              <textarea
                className="input min-h-40 py-3"
                onChange={(event) => setHierarchyLabels(event.target.value)}
                value={hierarchyLabels}
              />
            </Field>

            <Field label="Default task statuses">
              <textarea
                className="input min-h-40 py-3"
                onChange={(event) => setTaskStatuses(event.target.value)}
                value={taskStatuses}
              />
            </Field>
          </div>

          {message ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-900">
              {message}
            </div>
          ) : null}

          <button
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
            Create workspace
            {!isLoading ? <ArrowRight className="size-4" /> : null}
          </button>
        </form>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(217,70,239,0.16),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.18),transparent_34%)]" />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center">
        {children}
      </div>
    </main>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase text-slate-500">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function toList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatOnboardingError(message: string) {
  if (message.includes("Could not find the function")) {
    return "The onboarding database function is not installed yet. Run database/002_onboarding_bootstrap.sql in Supabase SQL Editor.";
  }

  if (message.toLowerCase().includes("not authenticated")) {
    return "Your session expired. Please sign in again.";
  }

  return message;
}
