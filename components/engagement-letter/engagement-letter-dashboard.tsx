"use client";

import { Download, Eye, FileText, Plus, Printer, X } from "lucide-react";
import { useMemo, useState } from "react";

type EngagementField = {
  key: string;
  label: string;
  placeholder: string;
  type?: "date" | "textarea" | "text";
};

type EngagementFormat = {
  id: string;
  category: string;
  title: string;
  description: string;
  fields: EngagementField[];
  clauses: string[];
};

type GeneratedLetter = {
  category: string;
  title: string;
  content: string;
};

const defaultFormats: EngagementFormat[] = [
  {
    id: "gst-compliance",
    category: "GST Compliance",
    title: "GST Compliance Engagement",
    description: "Standard format for GST return, compliance, notice support, and advisory assignments.",
    fields: [
      { key: "date", label: "Date", placeholder: "Letter date", type: "date" },
      { key: "clientName", label: "Client Name", placeholder: "ABC Private Limited" },
      { key: "clientAddress", label: "Client Address", placeholder: "Registered office address", type: "textarea" },
      { key: "gstin", label: "GSTIN", placeholder: "27AAAAA0000A1Z5" },
      { key: "scope", label: "Scope of Work", placeholder: "GST returns, reconciliations, notices, advisory", type: "textarea" },
      { key: "fee", label: "Professional Fee", placeholder: "Rs. 25,000 plus taxes" },
      { key: "period", label: "Engagement Period", placeholder: "FY 2026-27" },
      { key: "signatory", label: "Authorised Signatory", placeholder: "Name and designation" }
    ],
    clauses: [
      "This engagement letter records the understanding between WorkLine Co and {{clientName}} for professional services relating to {{scope}}.",
      "The services will be performed for GSTIN {{gstin}} for the period {{period}}, based on information and records made available by the client.",
      "The professional fee for this engagement will be {{fee}}. Taxes and out-of-pocket expenses, if any, will be charged separately.",
      "The client will remain responsible for completeness and accuracy of records, timely approvals, and statutory positions adopted in filings or replies.",
      "This letter may be accepted by signing below through {{signatory}}."
    ]
  },
  {
    id: "gstat-appeal",
    category: "GSTAT Appeal",
    title: "GSTAT Appeal Engagement",
    description: "Format for appeal filing, document preparation, hearing support, and matter tracking.",
    fields: [
      { key: "date", label: "Date", placeholder: "Letter date", type: "date" },
      { key: "clientName", label: "Client Name", placeholder: "ABC Private Limited" },
      { key: "clientAddress", label: "Client Address", placeholder: "Registered office address", type: "textarea" },
      { key: "matterTitle", label: "Matter Title", placeholder: "Appeal against Order No..." },
      { key: "orderReference", label: "Order Reference", placeholder: "OIA / DRC / DIN details" },
      { key: "scope", label: "Scope of Work", placeholder: "Appeal drafting, filing, hearing coordination", type: "textarea" },
      { key: "fee", label: "Professional Fee", placeholder: "Rs. 75,000 plus taxes" },
      { key: "signatory", label: "Authorised Signatory", placeholder: "Name and designation" }
    ],
    clauses: [
      "This engagement covers professional services for {{matterTitle}} concerning {{orderReference}}.",
      "WorkLine Co will assist with {{scope}}, subject to records, facts, and approvals provided by {{clientName}}.",
      "The client will be responsible for factual accuracy, statutory declarations, portal credentials, and timely payment of government fees, if any.",
      "The professional fee for this engagement will be {{fee}}. Additional appearances, adjournments, or expanded scope may be billed separately.",
      "This letter may be accepted by signing below through {{signatory}}."
    ]
  },
  {
    id: "general-advisory",
    category: "General Advisory",
    title: "Professional Advisory Engagement",
    description: "Flexible format for tax, compliance, research, representation, and consulting assignments.",
    fields: [
      { key: "date", label: "Date", placeholder: "Letter date", type: "date" },
      { key: "clientName", label: "Client Name", placeholder: "ABC Private Limited" },
      { key: "clientAddress", label: "Client Address", placeholder: "Registered office address", type: "textarea" },
      { key: "assignment", label: "Assignment", placeholder: "Brief description of assignment" },
      { key: "deliverables", label: "Deliverables", placeholder: "Opinion, memo, review note, filing support", type: "textarea" },
      { key: "fee", label: "Professional Fee", placeholder: "Rs. 40,000 plus taxes" },
      { key: "timeline", label: "Timeline", placeholder: "Within 10 working days from receipt of records" },
      { key: "signatory", label: "Authorised Signatory", placeholder: "Name and designation" }
    ],
    clauses: [
      "This engagement letter records the professional assignment for {{assignment}} for {{clientName}}.",
      "The agreed deliverables are {{deliverables}}, to be completed within {{timeline}}, subject to timely availability of information.",
      "The professional fee for this engagement will be {{fee}}. Taxes and out-of-pocket expenses, if any, will be charged separately.",
      "Advice will be based on facts, documents, and assumptions shared by the client and the law applicable at the time of issuance.",
      "This letter may be accepted by signing below through {{signatory}}."
    ]
  }
];

export function EngagementLetterDashboard() {
  const [activeFormat, setActiveFormat] = useState<EngagementFormat | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [generatedLetter, setGeneratedLetter] = useState<GeneratedLetter | null>(null);

  const dashboardStats = useMemo(
    () => [
      { label: "Saved Formats", value: String(defaultFormats.length) },
      { label: "Placeholder Fields", value: String(defaultFormats.reduce((sum, item) => sum + item.fields.length, 0)) },
      { label: "Generated Draft", value: generatedLetter ? "Ready" : "Not yet" }
    ],
    [generatedLetter]
  );

  function openCreateWindow(format: EngagementFormat) {
    setActiveFormat(format);
    setFormValues(
      format.fields.reduce<Record<string, string>>((values, field) => {
        values[field.key] = "";
        return values;
      }, {})
    );
    setGeneratedLetter(null);
  }

  function updateField(key: string, value: string) {
    setFormValues((current) => ({ ...current, [key]: value }));
  }

  function closeWindow() {
    setActiveFormat(null);
    setFormValues({});
  }

  function generateLetter() {
    if (!activeFormat) {
      return;
    }

    const replacePlaceholders = (text: string) =>
      text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => formValues[key]?.trim() || `[${key}]`);

    const address = formValues.clientAddress?.trim() || "[clientAddress]";
    const dated = formValues.date?.trim() || "[date]";
    const clauses = activeFormat.clauses.map((clause, index) => `${index + 1}. ${replacePlaceholders(clause)}`).join("\n\n");

    setGeneratedLetter({
      category: activeFormat.category,
      title: activeFormat.title,
      content: [
        `Date: ${dated}`,
        "",
        "To,",
        formValues.clientName?.trim() || "[clientName]",
        address,
        "",
        `Subject: ${activeFormat.title}`,
        "",
        "Dear Sir/Madam,",
        "",
        clauses,
        "",
        "For WorkLine Co",
        "",
        "Authorised Signatory"
      ].join("\n")
    });
  }

  function downloadGeneratedLetter() {
    if (!generatedLetter) {
      return;
    }

    const file = new Blob([generatedLetter.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${generatedLetter.category.replace(/\s+/g, "-").toLowerCase()}-engagement-letter.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="mt-5 grid gap-4 md:grid-cols-3">
        {dashboardStats.map((stat) => (
          <div className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]" key={stat.label}>
            <p className="text-xs font-black uppercase text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {defaultFormats.map((format) => (
            <article className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]" key={format.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800">
                  <FileText className="size-6" />
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">
                  {format.fields.length} blanks
                </span>
              </div>
              <p className="mt-5 text-xs font-black uppercase text-cyan-700">{format.category}</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">{format.title}</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{format.description}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {format.fields.slice(0, 5).map((field) => (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600" key={field.key}>
                    {field.label}
                  </span>
                ))}
                {format.fields.length > 5 ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    +{format.fields.length - 5} more
                  </span>
                ) : null}
              </div>

              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
                onClick={() => openCreateWindow(format)}
                type="button"
              >
                <Plus className="size-4" />
                Create EL
              </button>
            </article>
          ))}
        </div>

        <aside className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Eye className="size-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Generated Preview</p>
              <h2 className="text-xl font-black text-slate-950">{generatedLetter?.title ?? "No draft generated"}</h2>
            </div>
          </div>

          {generatedLetter ? (
            <>
              <pre className="mt-5 max-h-[540px] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
                {generatedLetter.content}
              </pre>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-black text-white"
                  onClick={downloadGeneratedLetter}
                  type="button"
                >
                  <Download className="size-4" />
                  Download
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
                  onClick={() => window.print()}
                  type="button"
                >
                  <Printer className="size-4" />
                  Print
                </button>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold leading-6 text-slate-600">
              Select Create EL under any saved category, fill the blank fields, and generate a draft here.
            </div>
          )}
        </aside>
      </section>

      {activeFormat ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-[28px] bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase text-cyan-700">{activeFormat.category}</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Create EL</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{activeFormat.title}</p>
              </div>
              <button
                className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"
                onClick={closeWindow}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {activeFormat.fields.map((field) => (
                <label className={field.type === "textarea" ? "md:col-span-2" : undefined} key={field.key}>
                  <span className="text-xs font-black uppercase text-slate-500">{field.label}</span>
                  {field.type === "textarea" ? (
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-cyan-500 focus:bg-white"
                      onChange={(event) => updateField(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      value={formValues[field.key] ?? ""}
                    />
                  ) : (
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-cyan-500 focus:bg-white"
                      onChange={(event) => updateField(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      type={field.type ?? "text"}
                      value={formValues[field.key] ?? ""}
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700"
                onClick={closeWindow}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-5 text-sm font-black text-white"
                onClick={generateLetter}
                type="button"
              >
                <FileText className="size-4" />
                Generate
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
