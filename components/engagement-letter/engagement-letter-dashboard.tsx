"use client";

import { Download, Eye, FileText, Plus, Printer, X } from "lucide-react";
import JSZip from "jszip";
import { useMemo, useState } from "react";

type EngagementField = {
  key: string;
  label: string;
  placeholder: string;
  type?: "date" | "textarea" | "text";
};

type TemplateReplacement = {
  search: string;
  value: (values: Record<string, string>) => string;
};

type EngagementFormat = {
  id: string;
  category: string;
  title: string;
  description: string;
  fields: EngagementField[];
  clauses: string[];
  templatePath?: string;
  templateReplacements?: TemplateReplacement[];
};

type GeneratedLetter = {
  category: string;
  title: string;
  content: string;
  format: EngagementFormat;
  values: Record<string, string>;
};

const formatTabs = [
  { key: "all", label: "All Formats" },
  { key: "gstat", label: "GSTAT EL" },
  { key: "gst", label: "GST EL" }
] as const;

type FormatTab = (typeof formatTabs)[number]["key"];

const defaultFormats: EngagementFormat[] = [
  {
    id: "gstat-tribunal",
    category: "GSTAT EL",
    title: "Engagement Letter - GSTAT Tribunal Stage",
    description: "Standard GSTAT tribunal-stage format using the original Word template so formatting, tables, and layout remain the same.",
    templatePath: "/templates/gstat-engagement-letter.docx",
    fields: [
      { key: "date", label: "Letter Date", placeholder: "08-05-2026", type: "date" },
      { key: "clientName", label: "Entity Name", placeholder: "M/s. Genesis Integrated Services & Solutions" },
      { key: "gstin", label: "GSTIN", placeholder: "09ALLPR0532J1ZU" },
      { key: "documentPeriod", label: "Document Period", placeholder: "FY 2026-27" },
      { key: "engagementNo", label: "Engagement Letter No.", placeholder: "2026/05/10" },
      { key: "orderReference", label: "Order Reference No.", placeholder: "ZD090824360281A" },
      { key: "orderDate", label: "Order Date", placeholder: "31.08.2024" },
      { key: "authority", label: "Authority", placeholder: "Ld. Deputy Commissioner, Ghaziabad, Block-16, Uttar Pradesh", type: "textarea" },
      { key: "stage", label: "Stage", placeholder: "Tribunal Stage" },
      { key: "draftingFee", label: "Drafting Fee", placeholder: "50000" },
      { key: "representationFee", label: "Representation Fee", placeholder: "50000" },
      { key: "travelFee", label: "Travel Expenses", placeholder: "16000" },
      { key: "filingFee", label: "Filing Expenses", placeholder: "5000" },
      { key: "acknowledger", label: "Acknowledged By", placeholder: "Name of authorised person" },
      { key: "place", label: "Place", placeholder: "Jaipur" }
    ],
    clauses: [
      "This format uses the GSTAT tribunal-stage Word template as the base document.",
      "The generator replaces the entity details, GSTIN, document period, engagement number, order details, stage, fee table values, letter date, acknowledgement name, and place inside the original DOCX.",
      "Download Word Draft will preserve the source template formatting, including tables and spacing."
    ],
    templateReplacements: [
      {
        search: "GENESIS INTEGRATED SERVICES & SOLUTIONS",
        value: (values) => stripFirmPrefix(cleanValue(values.clientName, "[Entity Name]")).toUpperCase()
      },
      { search: "M/s Genesis Integrated Services & Solutions", value: (values) => cleanValue(values.clientName, "M/s. [Entity Name]") },
      { search: "M/s. Genesis Integrated Services & Solutions", value: (values) => cleanValue(values.clientName, "M/s. [Entity Name]") },
      { search: "Genesis Integrated Services & Solutions", value: (values) => stripFirmPrefix(cleanValue(values.clientName, "[Entity Name]")) },
      { search: "09ALLPR0532J1ZU", value: (values) => cleanValue(values.gstin, "[GSTIN]") },
      { search: "FY 2026-27", value: (values) => cleanValue(values.documentPeriod, "[Document Period]") },
      { search: "2026/05/10", value: (values) => cleanValue(values.engagementNo, "[Engagement Letter No.]") },
      { search: "Tribunal Stage", value: (values) => cleanValue(values.stage, "[Stage]") },
      { search: "ZD090824360281A", value: (values) => cleanValue(values.orderReference, "[Order Reference No.]") },
      { search: "31.08.2024", value: (values) => cleanValue(values.orderDate, "[Order Date]") },
      {
        search: "Ld. Deputy Commissioner, Ghaziabad, Block-16, Uttar Pradesh",
        value: (values) => cleanValue(values.authority, "[Authority]")
      },
      { search: "Date: 08-05-2026", value: (values) => `Date: ${formatDateForDocument(cleanValue(values.date, "[Letter Date]"))}` },
      {
        search: " on behalf of the management of M/s. Genesis Integrated Services & Solutions, hereby accept and agree to the aforesaid scope of services and terms of engagement along with the commercial terms provided above by M/s Dhadda & Co., Chartered Accountants.",
        value: (values) => ` ${cleanValue(values.acknowledger, "[Acknowledged By]")}, on behalf of the management of ${cleanValue(values.clientName, "M/s. [Entity Name]")}, hereby accept and agree to the aforesaid scope of services and terms of engagement along with the commercial terms provided above by M/s Dhadda & Co., Chartered Accountants.`
      },
      { search: "Place:", value: (values) => `Place: ${cleanValue(values.place, "[Place]")}` }
    ]
  },
  {
    id: "gst-retainership",
    category: "Retainership",
    title: "Engagement Letter - GST Retainership",
    description: "Format for monthly GST compliance, advisory, refund support, pre-SCN matters, and department audit support.",
    fields: [
      { key: "date", label: "Date", placeholder: "Letter date", type: "date" },
      { key: "clientName", label: "Entity Name", placeholder: "M/s. ABC Private Limited" },
      { key: "clientAddress", label: "Entity Address", placeholder: "Registered office address", type: "textarea" },
      { key: "effectiveDate", label: "Effective From", placeholder: "1st April 2026" },
      { key: "coveredEntities", label: "Entities Covered", placeholder: "List entities covered for monthly compliances", type: "textarea" },
      { key: "monthlyFee", label: "Monthly Fee", placeholder: "Rs. 45,000 per month" },
      { key: "billingCycle", label: "Billing Cycle", placeholder: "Monthly" },
      { key: "paymentCycle", label: "Payment Cycle", placeholder: "Monthly" },
      { key: "acknowledger", label: "Acknowledged By", placeholder: "Name of authorised person" },
      { key: "place", label: "Place", placeholder: "Jaipur" }
    ],
    clauses: [
      "At the outset, we thank you for providing us an opportunity to submit our terms of engagement for providing review, advisory and compliance services relating to Goods and Services Tax Law(s) enacted in India to {{clientName}}.",
      "We are engaged by the entity for providing advisory and consultancy services with respect to Goods and Services Tax Law(s) with effect from {{effectiveDate}}.",
      "Monthly compliance services shall include filing of GSTR-1 and GSTR-3B.",
      "Advisory services shall include advice on compliance related matters, technical issues in filing GST returns, documentation practices including invoices, delivery challans and e-way bills, regular GST transaction queries, department correspondence, meetings on GST issues, and GST implications in agreements.",
      "Additional support shall include GST updates, periodical newsletters, advisory on amendments, refund applications, response to deficiency memos and show cause notices in respect of refunds, and representation services for pre-SCN matters.",
      "Department audit support may include assistance in compilation of relevant information, review of information to be shared with audit authorities, strategy advisory, support on technical issues raised during audit, drafting replies to preliminary audit objections or final audit report, and coordination till conclusion of audit.",
      "Services excluded from retainership include replies to show cause notices, appeals before Commissioner (Appeals), investigation proceedings, legal or professional opinions, and appeals before Tribunal, unless separately agreed.",
      "Entities covered under this retainership: {{coveredEntities}}.",
      "The entity shall ensure timely compilation of data, collation of documents, provision of information and system reports, communication with suppliers, expense credit reconciliation, decisions on reconciliation items and credit claims, ITC mismatch action points, and reconciliation of working and financial details.",
      "We shall make every reasonable effort to avoid errors or omissions. However, tax laws and Indian GAAP are voluminous, ambiguous and constantly changing, and the entity shall be free to follow or disregard recommendations in whole or in part.",
      "The assignment shall be undertaken by a team comprising Partner, Senior Manager, Manager and Executive of the firm. The billing shall be {{monthlyFee}}, out of pocket expenses shall be billed separately, billing shall be on {{billingCycle}} basis, payment cycle shall be {{paymentCycle}}, and applicable taxes shall be extra.",
      "A countersigned copy of this engagement letter shall be a valid confirmation of the terms, scope and commercial understanding. Acknowledged by {{acknowledger}} at {{place}}."
    ]
  },
  {
    id: "gst-review",
    category: "GST Review",
    title: "Engagement Letter - GST Review Services",
    description: "Format for GST review and verification services with exception-based report and recommendations.",
    fields: [
      { key: "date", label: "Date", placeholder: "Letter date", type: "date" },
      { key: "clientName", label: "Entity Name", placeholder: "M/s. ABC Private Limited" },
      { key: "clientAddress", label: "Entity Address", placeholder: "Registered office address", type: "textarea" },
      { key: "entityWork", label: "Entity Work", placeholder: "Business profile / nature of activities", type: "textarea" },
      { key: "documentPeriod", label: "Document Period", placeholder: "FY 2026-27" },
      { key: "reviewPeriod", label: "Review Period", placeholder: "April 2026 to March 2027" },
      { key: "fee", label: "Lump Sum Fee", placeholder: "Rs. 1,40,000" },
      { key: "advancePercent", label: "Advance Billing", placeholder: "30%" },
      { key: "balanceMilestone", label: "Balance Milestone", placeholder: "On sharing of deliverables" },
      { key: "acknowledger", label: "Acknowledged By", placeholder: "Name of authorised person" },
      { key: "place", label: "Place", placeholder: "Jaipur" }
    ],
    clauses: [
      "At the outset, we thank you for providing us an opportunity to submit our terms of engagement for providing review and verification services relating to Goods and Services Tax Law(s) enacted in India to {{clientName}}.",
      "As explained to us, this assignment shall be carried out for {{clientName}}, which is {{entityWork}}. Document period: {{documentPeriod}}. Review period: {{reviewPeriod}}.",
      "We shall provide review and verification services, including review of documentation aspects under GST, verification of input tax credit claimed, verification of tax liability discharged, and suggestions based on information received from the entity.",
      "The review shall cover tax positions under GST, GSTR-3B disclosures, GSTR-1 disclosures, GSTR-2A/2B versus ITC in books and returns, primary data analytics, reconciliation of GST returns with financial details, place of records, tax rates, time of supply, exemptions, supplier invoices for ITC, blocked credit eligibility, RCM, documentation practices, GST records, cross charge, ISD mechanism, reversal of ITC, GST registrations, credit leakage, valuation including related party transactions, books and records, agreements and contracts, and system reports.",
      "We shall share an exception-based report highlighting issues observed during the process and recommendations on tax optimization strategy.",
      "The entity shall ensure timely compilation of data and documents required for review, including basic data, documents, information, system reports, previous returns, supplier communication, expense credit reconciliation, decisions on reconciliation items and credit claims, ITC mismatch action points, and reconciliation of provisional credits, reversals and re-credits.",
      "We shall make every reasonable effort to avoid errors or omissions. However, tax laws and Indian GAAP are voluminous, ambiguous and constantly changing, and the entity shall be free to follow or disregard recommendations in whole or in part.",
      "The assignment shall be undertaken by a team comprising Partner, Senior Manager, Manager and Executive of the firm. The billing for the project shall be a lump sum amount of {{fee}}, with {{advancePercent}} payable at confirmation of engagement and the remaining amount payable {{balanceMilestone}}. Out of pocket expenses and applicable taxes shall be extra.",
      "A countersigned copy of this engagement letter shall be a valid confirmation of the terms, scope and commercial understanding. Acknowledged by {{acknowledger}} at {{place}}."
    ]
  },
  {
    id: "gst-summon",
    category: "Summon / Litigation",
    title: "Engagement Letter - GST Litigation Representation Services",
    description: "Format for summons, reply drafting, appearance, and follow-up representation before GST authority.",
    fields: [
      { key: "date", label: "Date", placeholder: "Letter date", type: "date" },
      { key: "clientName", label: "Entity Name", placeholder: "M/s. ABC Private Limited" },
      { key: "clientAddress", label: "Entity Address", placeholder: "Registered office address", type: "textarea" },
      { key: "authority", label: "Authority", placeholder: "Superintendent / GST Authority" },
      { key: "issue", label: "Summon Issue", placeholder: "Inquiry related to non-payment of GST on input services under RCM", type: "textarea" },
      { key: "stage", label: "Stage", placeholder: "Summon Stage" },
      { key: "feeBreakup", label: "Fee Break-up", placeholder: "Drafting reply and appearance - Rs. 75,000", type: "textarea" },
      { key: "advancePercent", label: "Advance Payment", placeholder: "60%" },
      { key: "balancePercent", label: "Balance Payment", placeholder: "40%" },
      { key: "place", label: "Place", placeholder: "Jaipur" },
      { key: "acknowledger", label: "Acknowledged By", placeholder: "Name of authorised person" }
    ],
    clauses: [
      "At the outset, we thank you for providing us an opportunity to submit our terms of engagement for providing representation services relating to Goods and Services Tax Law(s) enacted in India to {{clientName}}.",
      "A summon was issued by {{authority}} for {{issue}}. We have been approached to share an engagement letter for professional services in this regard.",
      "The scope of professional services at {{stage}} shall include drafting of reply to summon, representing before the authority, and coordinating follow-up matters.",
      "We shall make every reasonable effort to avoid errors or omissions. However, tax laws and Indian GAAP are voluminous, ambiguous and constantly changing, and the entity shall be free to follow or disregard recommendations in whole or in part.",
      "The assignment shall be undertaken by a team comprising Senior Partner, Senior Manager, Manager and Executive of the firm.",
      "The work shall be carried out for the following fee break-up and conditions: {{feeBreakup}}. The professional fee shall be applicable for appearance before a single adjudicating authority.",
      "Printing, postage and office supplies, out of pocket expenses, travelling, lodging and boarding expenses shall be charged separately. Applicable taxes shall be extra.",
      "{{advancePercent}} shall be payable in advance on confirmation of engagement letter and balance {{balancePercent}} shall be payable on submission before the respective authority.",
      "A countersigned copy of this engagement letter shall be a valid confirmation of the terms, scope and commercial understanding. Acknowledged by {{acknowledger}} at {{place}}."
    ]
  }
];

function cleanValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function stripFirmPrefix(value: string) {
  return value.replace(/^M\/s\.?\s*/i, "");
}

function formatDateForDocument(value: string) {
  if (!value || value.startsWith("[")) {
    return value;
  }

  const [year, month, day] = value.split("-");

  if (year && month && day) {
    return `${day}-${month}-${year}`;
  }

  return value;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceAllXmlText(xml: string, search: string, replacement: string) {
  return xml.split(xmlEscape(search)).join(xmlEscape(replacement));
}

function applyGstatFeeReplacements(xml: string, values: Record<string, string>) {
  const replacements = [
    cleanValue(values.draftingFee, "[Drafting Fee]"),
    cleanValue(values.representationFee, "[Representation Fee]")
  ];
  let index = 0;

  let updatedXml = xml.replace(/(<w:t[^>]*>)50000(<\/w:t>)/g, (match, openTag: string, closeTag: string) => {
    const replacement = replacements[index];
    index += 1;
    return replacement ? `${openTag}${xmlEscape(replacement)}${closeTag}` : match;
  });

  updatedXml = updatedXml.replace(
    /(<w:t[^>]*>)16000(<\/w:t>)/,
    (_match, openTag: string, closeTag: string) => `${openTag}${xmlEscape(cleanValue(values.travelFee, "[Travel Expenses]"))}${closeTag}`
  );
  updatedXml = updatedXml.replace(
    /(<w:t[^>]*>)5000(<\/w:t>)/,
    (_match, openTag: string, closeTag: string) => `${openTag}${xmlEscape(cleanValue(values.filingFee, "[Filing Expenses]"))}${closeTag}`
  );

  return updatedXml;
}

export function EngagementLetterDashboard() {
  const [activeTab, setActiveTab] = useState<FormatTab>("gstat");
  const [activeFormat, setActiveFormat] = useState<EngagementFormat | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [generatedLetter, setGeneratedLetter] = useState<GeneratedLetter | null>(null);

  const visibleFormats = useMemo(() => {
    if (activeTab === "gstat") {
      return defaultFormats.filter((format) => format.category === "GSTAT EL");
    }

    if (activeTab === "gst") {
      return defaultFormats.filter((format) => format.category !== "GSTAT EL");
    }

    return defaultFormats;
  }, [activeTab]);

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
      format: activeFormat,
      values: formValues,
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
        "For Dhadda & Co.",
        "",
        "Yash Dhadda",
        "[Partner]",
        "",
        "Acknowledgement",
        `I, ${formValues.acknowledger?.trim() || "[acknowledger]"}, on behalf of management of ${formValues.clientName?.trim() || "[clientName]"} hereby accept the aforesaid scope of services and terms of engagement along with commercial terms provided above by M/s Dhadda & Co., Chartered Accountants.`,
        "",
        `For ${formValues.clientName?.trim() || "[clientName]"}`,
        "",
        "(                         )",
        "",
        "Date:",
        `Place: ${formValues.place?.trim() || "[place]"}`,
        "",
        "Authorised Signatory"
      ].join("\n")
    });
  }

  async function downloadGeneratedLetter() {
    if (!generatedLetter) {
      return;
    }

    if (generatedLetter.format.templatePath) {
      await downloadTemplateLetter(generatedLetter);
      return;
    }

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111827; }
            h1 { font-size: 16pt; text-align: center; }
            p { margin: 0 0 10px; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(generatedLetter.title)}</h1>
          ${generatedLetter.content.split("\n\n").map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
        </body>
      </html>
    `;
    const file = new Blob([html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${generatedLetter.category.replace(/\s+/g, "-").toLowerCase()}-engagement-letter.doc`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadTemplateLetter(letter: GeneratedLetter) {
    const response = await fetch(letter.format.templatePath as string);

    if (!response.ok) {
      throw new Error("Could not load the engagement letter template.");
    }

    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const documentXml = zip.file("word/document.xml");

    if (!documentXml) {
      throw new Error("The engagement letter template is missing document.xml.");
    }

    let xml = await documentXml.async("string");

    letter.format.templateReplacements?.forEach((replacement) => {
      xml = replaceAllXmlText(xml, replacement.search, replacement.value(letter.values));
    });

    if (letter.format.id === "gstat-tribunal") {
      xml = applyGstatFeeReplacements(xml, letter.values);
    }

    zip.file("word/document.xml", xml);

    const output = await zip.generateAsync({
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      type: "blob"
    });
    const url = URL.createObjectURL(output);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${letter.category.replace(/\s+/g, "-").replace(/\//g, "").toLowerCase()}-engagement-letter.docx`;
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
        <div className="rounded-[28px] border border-white/80 bg-white/90 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
            {formatTabs.map((tab) => (
              <button
                className={`h-10 rounded-2xl px-4 text-sm font-black transition ${
                  activeTab === tab.key ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {visibleFormats.map((format) => (
              <article
                className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(190px,0.7fr)_minmax(0,1.3fr)_auto] lg:items-center"
                key={format.id}
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-800">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase text-cyan-700">{format.category}</p>
                    <h2 className="truncate text-base font-black text-slate-950">{format.title}</h2>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{format.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {format.fields.slice(0, 4).map((field) => (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600" key={field.key}>
                        {field.label}
                      </span>
                    ))}
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      {format.fields.length} blanks
                    </span>
                  </div>
                </div>

                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
                  onClick={() => openCreateWindow(format)}
                  type="button"
                >
                  <Plus className="size-4" />
                  Create EL
                </button>
              </article>
            ))}
          </div>
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
                  Download Word Draft
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
