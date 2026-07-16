"use client";

import { supabase } from "@/lib/supabase/client";
import { getOrganisationId } from "@/lib/supabase/session";
import { getCached, setCached } from "@/lib/data-cache";
import {
  AlertCircle,
  Building2,
  FileSearch,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type GstRegistration = {
  id: string;
  organisation_id: string;
  client_name: string;
  gstin: string;
  trade_name: string | null;
  state_name: string | null;
  portal_status: string;
};

type GstLitigationCase = {
  id: string;
  organisation_id: string;
  gst_registration_id: string;
  serial_no: number | null;
  notice_type: string | null;
  description: string | null;
  ref_id: string | null;
  date_of_issue: string | null;
  case_id: string | null;
  status: string | null;
  tax_period: string | null;
  due_date: string | null;
  section: string | null;
  reply_filing_status: string | null;
  source: string;
};

export function GstTracker() {
  const [organisationId, setOrganisationId] = useState("");
  const [registrations, setRegistrations] = useState<GstRegistration[]>([]);
  const [cases, setCases] = useState<GstLitigationCase[]>([]);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isSavingCase, setIsSavingCase] = useState(false);

  const [clientName, setClientName] = useState("");
  const [gstin, setGstin] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [stateName, setStateName] = useState("");

  const [noticeType, setNoticeType] = useState("");
  const [description, setDescription] = useState("");
  const [refId, setRefId] = useState("");
  const [dateOfIssue, setDateOfIssue] = useState("");
  const [caseId, setCaseId] = useState("");
  const [caseStatus, setCaseStatus] = useState("");
  const [taxPeriod, setTaxPeriod] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [section, setSection] = useState("");
  const [replyFilingStatus, setReplyFilingStatus] = useState("");

  const dataHydratedRef = useRef(false);

  useEffect(() => {
    void loadWorkspace();
  }, []);

  async function loadWorkspace() {
    setIsLoading(true);
    setMessage("");

    const orgId = await getOrganisationId();

    if (!orgId) {
      setMessage("Create your organisation workspace before using GST Litigation Monitor.");
      setIsLoading(false);
      return;
    }

    setOrganisationId(orgId);

    const cacheKey = `gst:${orgId}`;

    if (!dataHydratedRef.current) {
      const cached = getCached<{ cases: GstLitigationCase[]; registrations: GstRegistration[] }>(cacheKey);

      if (cached) {
        setRegistrations(cached.registrations);
        setCases(cached.cases);
        setSelectedRegistrationId((current) => current || cached.registrations[0]?.id || "");
        setIsLoading(false);
      }
    }

    dataHydratedRef.current = true;

    const [{ data: gstRows, error: gstError }, { data: caseRows, error: caseError }] =
      await Promise.all([
        supabase
          .from("gst_registrations")
          .select("*")
          .eq("organisation_id", orgId)
          .order("client_name", { ascending: true }),
        supabase
          .from("gst_litigation_cases")
          .select("*")
          .eq("organisation_id", orgId)
          .order("date_of_issue", { ascending: false, nullsFirst: false })
      ]);

    if (gstError || caseError) {
      setMessage(formatLoadError(gstError?.message ?? caseError?.message ?? "Unable to load GST litigation data."));
      setIsLoading(false);
      return;
    }

    const registrations = (gstRows ?? []) as GstRegistration[];
    const cases = (caseRows ?? []) as GstLitigationCase[];
    setCached(cacheKey, { cases, registrations });
    setRegistrations(registrations);
    setCases(cases);
    setSelectedRegistrationId((current) => current || registrations[0]?.id || "");
    setIsLoading(false);
  }

  async function addRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingClient(true);
    setMessage("");

    const { error } = await supabase.from("gst_registrations").insert({
      client_name: clientName.trim(),
      gstin: gstin.trim().toUpperCase(),
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
    setIsSavingClient(false);
    await loadWorkspace();
  }

  async function addCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingCase(true);
    setMessage("");

    const { error } = await supabase.from("gst_litigation_cases").insert({
      case_id: caseId.trim() || null,
      date_of_issue: dateOfIssue || null,
      description: description.trim() || null,
      due_date: dueDate || null,
      gst_registration_id: selectedRegistrationId,
      notice_type: noticeType.trim() || null,
      organisation_id: organisationId,
      ref_id: refId.trim() || null,
      reply_filing_status: replyFilingStatus.trim() || null,
      section: section.trim() || null,
      serial_no: visibleCases.length + 1,
      source: "manual",
      status: caseStatus.trim() || null,
      tax_period: taxPeriod.trim() || null
    });

    if (error) {
      setMessage(error.message);
      setIsSavingCase(false);
      return;
    }

    setNoticeType("");
    setDescription("");
    setRefId("");
    setDateOfIssue("");
    setCaseId("");
    setCaseStatus("");
    setTaxPeriod("");
    setDueDate("");
    setSection("");
    setReplyFilingStatus("");
    setIsSavingCase(false);
    await loadWorkspace();
  }

  function openGstPortal() {
    if (!selectedRegistration) {
      setMessage("Select a GST client before opening the GST portal.");
      return;
    }

    window.open("https://services.gst.gov.in/services/login", "_blank", "noopener,noreferrer");
    setMessage("GST portal opened in a new tab. Copy notice details into the form below and click Add.");
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
  const visibleCases = cases.filter((item) =>
    selectedRegistrationId ? item.gst_registration_id === selectedRegistrationId : true
  );
  const openCases = cases.filter((item) => !["closed", "disposed", "replied"].includes((item.status ?? "").toLowerCase())).length;
  const dueSoon = cases.filter((item) => {
    if (!item.due_date) {
      return false;
    }

    const today = new Date();
    const due = new Date(item.due_date);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  return (
    <main className="min-h-screen bg-[#f4f6fa] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 " />

      <section className="mx-auto max-w-[1540px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black uppercase text-rose-800">
                  Priority build
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-800">
                  GST portal litigation monitor
                </span>
              </div>
              <h1 className="mt-3 text-4xl font-black leading-tight text-slate-950">
                GST Litigation Monitor
              </h1>
              <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
                Track notices, proceedings, case IDs, sections, tax periods,
                due dates, and reply filing status. Open the GST portal when
                needed, then save notice details directly in this shared tracker.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <Metric label="GSTINs" value={registrations.length.toString()} tone="bg-sky-100 text-sky-800" />
              <Metric label="Open" value={openCases.toString()} tone="bg-amber-100 text-amber-800" />
              <Metric label="Due 7d" value={dueSoon.toString()} tone="bg-rose-100 text-rose-800" />
            </div>
          </div>

        </header>

        {message ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p>{message}</p>
              </div>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-5 rounded-[28px] border border-white/80 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <Loader2 className="size-6 animate-spin text-navy-700" />
            <p className="mt-4 text-sm font-bold text-slate-600">Loading GST litigation workspace...</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[0.66fr_1.34fr]">
            <aside className="space-y-5">
              <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-navy-700">GSTIN source list</p>
                    <h2 className="mt-2 text-2xl font-black">Clients</h2>
                  </div>
                  <button className="flex size-10 items-center justify-center rounded-2xl bg-navy-700 text-white" onClick={() => void loadWorkspace()} type="button">
                    <RefreshCw className="size-4" />
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
                  <Search className="size-4 text-slate-400" />
                  <input className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none" onChange={(event) => setSearch(event.target.value)} placeholder="Search client or GSTIN" value={search} />
                </div>

                <div className="mt-4 max-h-[440px] space-y-2 overflow-auto pr-1">
                  {filteredRegistrations.map((registration) => (
                    <button
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        registration.id === selectedRegistrationId ? "border-navy-300 bg-navy-50" : "border-slate-200 bg-slate-50 hover:bg-white"
                      }`}
                      key={registration.id}
                      onClick={() => setSelectedRegistrationId(registration.id)}
                      type="button"
                    >
                      <p className="text-sm font-black text-slate-950">{registration.client_name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{registration.gstin}</p>
                      <p className="mt-2 text-[11px] font-black uppercase text-slate-400">{registration.trade_name || registration.state_name || "Portal credentials mapped externally"}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
                <h2 className="text-xl font-black text-slate-950">Add client GSTIN</h2>
                <form className="mt-4 space-y-3" onSubmit={addRegistration}>
                  <input className="input" onChange={(e) => setClientName(e.target.value)} placeholder="Client name" required value={clientName} />
                  <input className="input uppercase" maxLength={15} minLength={15} onChange={(e) => setGstin(e.target.value)} placeholder="GSTIN from Excel A2" required value={gstin} />
                  <input className="input" onChange={(e) => setTradeName(e.target.value)} placeholder="Trade name optional" value={tradeName} />
                  <input className="input" onChange={(e) => setStateName(e.target.value)} placeholder="State optional" value={stateName} />
                  <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-navy-700 text-sm font-black text-white" disabled={isSavingClient} type="submit">
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
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-700">Litigation / notices</p>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">{selectedRegistration?.client_name ?? "Select a GST client"}</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">{selectedRegistration?.gstin ?? "Add a GSTIN to begin monitoring portal cases"}</p>
                  </div>
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                    <button
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-navy-700 px-5 text-sm font-black text-white shadow-sm transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!selectedRegistrationId}
                      onClick={openGstPortal}
                      type="button"
                    >
                      <LogIn className="size-4" />
                      Open GST portal
                    </button>
                    <Metric label="Rows" value={visibleCases.length.toString()} tone="bg-slate-100 text-slate-700" />
                  </div>
                </div>

                <form className="mt-5 grid gap-3 lg:grid-cols-12" onSubmit={addCase}>
                  <input className="input lg:col-span-2" onChange={(e) => setNoticeType(e.target.value)} placeholder="Type of Notice" value={noticeType} />
                  <input className="input lg:col-span-3" onChange={(e) => setDescription(e.target.value)} placeholder="Description" value={description} />
                  <input className="input lg:col-span-2" onChange={(e) => setRefId(e.target.value)} placeholder="Ref ID" value={refId} />
                  <input className="input lg:col-span-2" onChange={(e) => setDateOfIssue(e.target.value)} type="date" value={dateOfIssue} />
                  <input className="input lg:col-span-3" onChange={(e) => setCaseId(e.target.value)} placeholder="Case ID" value={caseId} />
                  <input className="input lg:col-span-2" onChange={(e) => setCaseStatus(e.target.value)} placeholder="Status" value={caseStatus} />
                  <input className="input lg:col-span-2" onChange={(e) => setTaxPeriod(e.target.value)} placeholder="Tax Period" value={taxPeriod} />
                  <input className="input lg:col-span-2" onChange={(e) => setDueDate(e.target.value)} type="date" value={dueDate} />
                  <input className="input lg:col-span-2" onChange={(e) => setSection(e.target.value)} placeholder="Section" value={section} />
                  <input className="input lg:col-span-3" onChange={(e) => setReplyFilingStatus(e.target.value)} placeholder="Reply Filing" value={replyFilingStatus} />
                  <button className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-navy-700 px-4 text-sm font-black text-white disabled:opacity-60 lg:col-span-1" disabled={!selectedRegistrationId || isSavingCase} type="submit">
                    {isSavingCase ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Add
                  </button>
                </form>

                <div className="mt-5 overflow-auto rounded-2xl border border-slate-200">
                  <table className="w-full min-w-[1280px] border-collapse bg-white text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 [&_th]:border-b [&_th]:border-slate-200">
                      <tr>
                        {["S.No.", "Type of Notice", "Description", "Ref ID", "Date of Issue", "Case ID", "Status", "Tax Period", "Due Date", "Section", "Reply Filing"].map((column) => (
                          <th className="px-4 py-3" key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCases.map((item, index) => (
                        <tr className="border-t border-slate-100" key={item.id}>
                          <td className="px-4 py-3 font-bold">{item.serial_no ?? index + 1}</td>
                          <td className="px-4 py-3 font-bold">{item.notice_type || "-"}</td>
                          <td className="px-4 py-3">{item.description || "-"}</td>
                          <td className="px-4 py-3">{item.ref_id || "-"}</td>
                          <td className="px-4 py-3">{item.date_of_issue || "-"}</td>
                          <td className="px-4 py-3">{item.case_id || "-"}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">{item.status || "-"}</span>
                          </td>
                          <td className="px-4 py-3">{item.tax_period || "-"}</td>
                          <td className="px-4 py-3">{item.due_date || "-"}</td>
                          <td className="px-4 py-3">{item.section || "-"}</td>
                          <td className="px-4 py-3">{item.reply_filing_status || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                <InfoCard icon={ShieldCheck} title="Shared Tracker" text="Everyone in the firm can keep notice status, reply filing, and due dates in one workspace." />
                <InfoCard icon={FileSearch} title="Manual Entry" text="Open the GST portal, copy the notice details, and save the row here without any laptop setup." />
                <InfoCard icon={Scale} title="Legal Workflow First" text="The cloud dashboard stays shared by the firm and tracks notices, proceedings, replies, and due-date follow-up." />
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
    <article className="rounded-[24px] border border-white/80 