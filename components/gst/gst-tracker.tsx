"use client";

import { supabase } from "@/lib/supabase/client";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  IndianRupee,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type GstRegistration = {
  id: string;
  organisation_id: string;
  client_name: string;
  gstin: string;
  trade_name: string | null;
  state_name: string | null;
  registration_type: string;
  filing_frequency: string;
  portal_status: string;
};

type GstReturnTracker = {
  id: string;
  organisation_id: string;
  gst_registration_id: string;
  return_type: string;
  period_label: string;
  due_date: string | null;
  status: string;
  filed_at: string | null;
  arn: string | null;
  source: string;
  notes: string | null;
};

const returnTypes = ["GSTR-1", "GSTR-3B", "GSTR-9", "GSTR-9C"];
const statuses = ["pending", "filed", "not_applicable", "on_hold"];

export function GstTracker() {
  const [organisationId, setOrganisationId] = useState("");
  const [registrations, setRegistrations] = useState<GstRegistration[]>([]);
  const [trackers, setTrackers] = useState<GstReturnTracker[]>([]);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isSavingTracker, setIsSavingTracker] = useState(false);
  const [message, setMessage] = useState("");

  const [clientName, setClientName] = useState("");
  const [gstin, setGstin] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [stateName, setStateName] = useState("");
  const [filingFrequency, setFilingFrequency] = useState("Monthly");

  const [returnType, setReturnType] = useState("GSTR-3B");
  const [periodLabel, setPeriodLabel] = useState("May 2026");
  const [dueDate, setDueDate] = useState("");
  const [filingStatus, setFilingStatus] = useState("pending");
  const [filedAt, setFiledAt] = useState("");
  const [arn, setArn] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void loadWorkspace();
  }, []);

  async function loadWorkspace() {
    setIsLoading(true);
    setMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      setMessage("Please sign in again to access GST Tracker.");
      setIsLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("organisation_id")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !profile?.organisation_id) {
      setMessage("Create your organisation workspace before using GST Tracker.");
      setIsLoading(false);
      return;
    }

    setOrganisationId(profile.organisation_id);

    const [{ data: gstRows, error: gstError }, { data: trackerRows, error: trackerError }] =
      await Promise.all([
        supabase
          .from("gst_registrations")
          .select("*")
          .eq("organisation_id", profile.organisation_id)
          .order("client_name", { ascending: true }),
        supabase
          .from("gst_return_trackers")
          .select("*")
          .eq("organisation_id", profile.organisation_id)
          .order("due_date", { ascending: true, nullsFirst: false })
      ]);

    if (gstError || trackerError) {
      setMessage(formatLoadError(gstError?.message ?? trackerError?.message ?? "Unable to load GST data."));
      setIsLoading(false);
      return;
    }

    setRegistrations((gstRows ?? []) as GstRegistration[]);
    setTrackers((trackerRows ?? []) as GstReturnTracker[]);
    setSelectedRegistrationId((current) => current || gstRows?.[0]?.id || "");
    setIsLoading(false);
  }

  async function addRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingClient(true);
    setMessage("");

    const cleanedGstin = gstin.trim().toUpperCase();

    const { error } = await supabase.from("gst_registrations").insert({
      client_name: clientName.trim(),
      filing_frequency: filingFrequency,
      gstin: cleanedGstin,
      organisation_id: organisationId,
      state_name: stateName.trim() || null,
      trade_name: tradeName.trim() || null
    });

    if (error) {
      setMessage(error.message);
      setIsSavingClient(false);
      return;
    }

    setClientName("");
    setGstin("");
    setTradeName("");
    setStateName("");
    setFilingFrequency("Monthly");
    setIsSavingClient(false);
    await loadWorkspace();
  }

  async function addTracker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingTracker(true);
    setMessage("");

    const { error } = await supabase.from("gst_return_trackers").insert({
      arn: arn.trim() || null,
      due_date: dueDate || null,
      filed_at: filedAt || null,
      gst_registration_id: selectedRegistrationId,
      notes: notes.trim() || null,
      organisation_id: organisationId,
      period_label: periodLabel.trim(),
      return_type: returnType,
      source: "manual",
      status: filingStatus
    });

    if (error) {
      setMessage(error.message);
      setIsSavingTracker(false);
      return;
    }

    setReturnType("GSTR-3B");
    setPeriodLabel("May 2026");
    setDueDate("");
    setFilingStatus("pending");
    setFiledAt("");
    setArn("");
    setNotes("");
    setIsSavingTracker(false);
    await loadWorkspace();
  }

  async function updateTrackerStatus(tracker: GstReturnTracker, status: string) {
    const { error } = await supabase
      .from("gst_return_trackers")
      .update({
        filed_at: status === "filed" ? tracker.filed_at || new Date().toISOString().slice(0, 10) : tracker.filed_at,
        status
      })
      .eq("id", tracker.id)
      .eq("organisation_id", tracker.organisation_id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadWorkspace();
  }

  const filteredRegistrations = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return registrations;
    }

    return registrations.filter((registration) =>
      [registration.client_name, registration.trade_name, registration.gstin, registration.state_name]
        .filter(Boolean)
        .some((item) => item!.toLowerCase().includes(value))
    );
  }, [registrations, search]);

  const selectedRegistration = registrations.find((registration) => registration.id === selectedRegistrationId);
  const visibleTrackers = trackers.filter((tracker) =>
    selectedRegistrationId ? tracker.gst_registration_id === selectedRegistrationId : true
  );
  const pendingCount = trackers.filter((tracker) => tracker.status === "pending").length;
  const filedCount = trackers.filter((tracker) => tracker.status === "filed").length;
  const overdueCount = trackers.filter((tracker) => {
    if (tracker.status === "filed" || !tracker.due_date) {
      return false;
    }

    return tracker.due_date < new Date().toISOString().slice(0, 10);
  }).length;

  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(14,165,233,0.16),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(217,70,239,0.14),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.16),transparent_34%)]" />

      <section className="mx-auto max-w-[1500px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-800">
                  Urgent module
                </span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase text-emerald-800">
                  GST compliance tracker
                </span>
              </div>
              <h1 className="mt-3 text-4xl font-black leading-tight text-slate-950">
                GST Client Tracker
              </h1>
              <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
                Track client GSTINs, return periods, due dates, filing status,
                ARN, and portal/import source. Portal sync can be layered later
                through authorised API/import workflows without changing this model.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <Metric label="GSTINs" value={registrations.length.toString()} tone="bg-sky-100 text-sky-800" />
              <Metric label="Pending" value={pendingCount.toString()} tone="bg-amber-100 text-amber-800" />
              <Metric label="Overdue" value={overdueCount.toString()} tone="bg-rose-100 text-rose-800" />
            </div>
          </div>
        </header>

        {message ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{message}</p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-5 rounded-[28px] border border-white/80 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <Loader2 className="size-6 animate-spin text-teal-700" />
            <p className="mt-4 text-sm font-bold text-slate-600">Loading GST workspace...</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
            <aside className="space-y-5">
              <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Client GSTINs</p>
                    <h2 className="mt-2 text-2xl font-black">Registrations</h2>
                  </div>
                  <button
                    className="flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-white"
                    onClick={() => void loadWorkspace()}
                    type="button"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
                  <Search className="size-4 text-slate-400" />
                  <input
                    className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search client or GSTIN"
                    value={search}
                  />
                </div>

                <div className="mt-4 max-h-[520px] space-y-2 overflow-auto pr-1">
                  {filteredRegistrations.map((registration) => (
                    <button
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        registration.id === selectedRegistrationId
                          ? "border-teal-300 bg-teal-50"
                          : "border-slate-200 bg-slate-50 hover:bg-white"
                      }`}
                      key={registration.id}
                      onClick={() => setSelectedRegistrationId(registration.id)}
                      type="button"
                    >
                      <p className="text-sm font-black text-slate-950">{registration.client_name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{registration.gstin}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600">
                          {registration.filing_frequency}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-800">
                          {registration.portal_status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
                <h2 className="text-xl font-black text-slate-950">Add GSTIN</h2>
                <form className="mt-4 space-y-3" onSubmit={addRegistration}>
                  <input className="input" onChange={(e) => setClientName(e.target.value)} placeholder="Client name" required value={clientName} />
                  <input
                    className="input uppercase"
                    maxLength={15}
                    minLength={15}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="15 digit GSTIN"
                    required
                    value={gstin}
                  />
                  <input className="input" onChange={(e) => setTradeName(e.target.value)} placeholder="Trade name optional" value={tradeName} />
                  <input className="input" onChange={(e) => setStateName(e.target.value)} placeholder="State optional" value={stateName} />
                  <select className="input" onChange={(e) => setFilingFrequency(e.target.value)} value={filingFrequency}>
                    <option>Monthly</option>
                    <option>Quarterly</option>
                    <option>Annual</option>
                  </select>
                  <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white" disabled={isSavingClient} type="submit">
                    {isSavingClient ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Add GST client
                  </button>
                </form>
              </section>
            </aside>

            <section className="space-y-5">
              <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-700">Return monitor</p>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">
                      {selectedRegistration?.client_name ?? "Select a GST client"}
                    </h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      {selectedRegistration?.gstin ?? "Add a GSTIN to begin tracking returns"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <Metric label="Filed" value={filedCount.toString()} tone="bg-emerald-100 text-emerald-800" />
                    <Metric label="Rows" value={visibleTrackers.length.toString()} tone="bg-slate-100 text-slate-700" />
                  </div>
                </div>

                <form className="mt-5 grid gap-3 lg:grid-cols-6" onSubmit={addTracker}>
                  <select className="input lg:col-span-1" onChange={(e) => setReturnType(e.target.value)} value={returnType}>
                    {returnTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <input className="input lg:col-span-1" onChange={(e) => setPeriodLabel(e.target.value)} placeholder="May 2026" required value={periodLabel} />
                  <input className="input lg:col-span-1" onChange={(e) => setDueDate(e.target.value)} type="date" value={dueDate} />
                  <select className="input lg:col-span-1" onChange={(e) => setFilingStatus(e.target.value)} value={filingStatus}>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                  <input className="input lg:col-span-1" onChange={(e) => setFiledAt(e.target.value)} type="date" value={filedAt} />
                  <button
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60 lg:col-span-1"
                    disabled={!selectedRegistrationId || isSavingTracker}
                    type="submit"
                  >
                    {isSavingTracker ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Add row
                  </button>
                  <input className="input lg:col-span-2" onChange={(e) => setArn(e.target.value)} placeholder="ARN optional" value={arn} />
                  <input className="input lg:col-span-4" onChange={(e) => setNotes(e.target.value)} placeholder="Notes / portal observation" value={notes} />
                </form>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full min-w-[860px] border-collapse bg-white text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Return</th>
                        <th className="px-4 py-3">Period</th>
                        <th className="px-4 py-3">Due date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Filed</th>
                        <th className="px-4 py-3">ARN</th>
                        <th className="px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTrackers.map((tracker) => (
                        <tr className="border-t border-slate-100" key={tracker.id}>
                          <td className="px-4 py-3 font-black text-slate-950">{tracker.return_type}</td>
                          <td className="px-4 py-3 font-bold text-slate-700">{tracker.period_label}</td>
                          <td className="px-4 py-3 font-semibold text-slate-600">{tracker.due_date ?? "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusTone(tracker.status)}`}>
                              {statusLabel(tracker.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-600">{tracker.filed_at ?? "-"}</td>
                          <td className="px-4 py-3 font-semibold text-slate-600">{tracker.arn || "-"}</td>
                          <td className="px-4 py-3">
                            <button
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-50"
                              disabled={tracker.status === "filed"}
                              onClick={() => void updateTrackerStatus(tracker, "filed")}
                              type="button"
                            >
                              Mark filed
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                <InfoCard icon={ShieldCheck} title="Portal Sync Later" text="Do not store GST portal passwords. Use authorised APIs, import files, or controlled user-assisted intake." />
                <InfoCard icon={CalendarDays} title="Due Date Control" text="Due dates are editable because GST deadlines can vary by filing type, state, turnover, and notifications." />
                <InfoCard icon={IndianRupee} title="Billing Link Later" text="The same tracker can later drive compliance billing, fee realisation, and outstanding reports." />
              </section>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, tone, value }: { label: string; tone: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
      <p className={`inline-flex rounded-full px-2.5 py-1 text-sm font-black ${tone}`}>{value}</p>
      <p className="mt-2 text-[11px] font-black uppercase text-slate-500">{label}</p>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  text,
  title
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  title: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
      <Icon className="size-5 text-teal-700" />
      <h3 className="mt-3 text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{text}</p>
    </article>
  );
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function statusTone(status: string) {
  if (status === "filed") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (status === "on_hold") {
    return "bg-sky-100 text-sky-800";
  }

  if (status === "not_applicable") {
    return "bg-slate-100 text-slate-700";
  }

  return "bg-amber-100 text-amber-800";
}

function formatLoadError(message: string) {
  if (message.toLowerCase().includes("gst_registrations")) {
    return "GST database tables are not installed yet. Run database/003_gst_tracker.sql in Supabase SQL Editor.";
  }

  return message;
}
