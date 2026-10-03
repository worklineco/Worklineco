// Shared Engagement Letter formats + Word (.docx) generation.
// Used by the Engagement Letter tool and by TaskLine's "Draft EL" button so the
// same firm templates and field replacements produce identical documents.
import JSZip from "jszip";

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

export const engagementFormats: EngagementFormat[] = [
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
    templatePath: "/templates/retainership-engagement-letter.docx",
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
    ],
    templateReplacements: [
      { search: "____________", value: (values) => cleanValue(values.clientName, "M/s. [Entity Name]") },
      { search: "__________", value: (values) => stripFirmPrefix(cleanValue(values.clientName, "[Entity Name]")) },
      { search: "M/s.__________", value: (values) => cleanValue(values.clientName, "M/s. [Entity Name]") },
      { search: "1st April 2024", value: (values) => cleanValue(values.effectiveDate, "[Effective From]") },
      {
        search: "*Entity’s Covered*(Mention Entities that are covered for the monthly complinaces)",
        value: (values) => `*Entity’s Covered*\n${cleanValue(values.coveredEntities, "[Entities Covered]")}`
      },
      { search: "Rs 45,000/- per month", value: (values) => cleanValue(values.monthlyFee, "[Monthly Fee]") },
      { search: "Billing shall be done on Monthly basis.", value: (values) => `Billing shall be done on ${cleanValue(values.billingCycle, "[Billing Cycle]")} basis.` },
      { search: "Payment cycle shall be Monthly", value: (values) => `Payment cycle shall be ${cleanValue(values.paymentCycle, "[Payment Cycle]")}` },
      { search: "14-05-2024", value: (values) => formatDateForDocument(cleanValue(values.date, "[Date]")) },
      {
        search: "I                                , on behalf of management of",
        value: (values) => `I ${cleanValue(values.acknowledger, "[Acknowledged By]")}, on behalf of management of`
      },
      { search: "Place:", value: (values) => `Place: ${cleanValue(values.place, "[Place]")}` }
    ]
  },
  {
    id: "gst-review",
    category: "GST Review",
    title: "Engagement Letter - GST Review Services",
    description: "Format for GST review and verification services with exception-based report and recommendations.",
    templatePath: "/templates/review-engagement-letter.docx",
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
    ],
    templateReplacements: [
      { search: "______________", value: (values) => cleanValue(values.clientName, "M/s. [Entity Name]") },
      { search: "____________", value: (values) => cleanValue(values.clientName, "M/s. [Entity Name]") },
      { search: "__________", value: (values) => stripFirmPrefix(cleanValue(values.clientName, "[Entity Name]")) },
      { search: "(Entity’s Name)", value: (values) => cleanValue(values.clientName, "M/s. [Entity Name]") },
      { search: "(Entity's Work", value: (values) => cleanValue(values.entityWork, "[Entity Work]") },
      { search: "FY 2024-25", value: (values) => cleanValue(values.documentPeriod, "[Document Period]") },
      { search: "1,40,000/-", value: (values) => cleanValue(values.fee, "[Lump Sum Fee]") },
      { search: "30%", value: (values) => cleanValue(values.advancePercent, "[Advance Billing]") },
      { search: "Remaining shall be billed and payable on sharing of deliverables", value: (values) => `Remaining shall be billed and payable ${cleanValue(values.balanceMilestone, "[Balance Milestone]")}` },
      { search: "14-05-2024", value: (values) => formatDateForDocument(cleanValue(values.date, "[Date]")) },
      {
        search: "I                                , on behalf of management of",
        value: (values) => `I ${cleanValue(values.acknowledger, "[Acknowledged By]")}, on behalf of management of`
      },
      { search: "Place:", value: (values) => `Place: ${cleanValue(values.place, "[Place]")}` }
    ]
  },
  {
    id: "gst-summon",
    category: "Summon / Litigation",
    title: "Engagement Letter - GST Litigation Representation Services",
    description: "Format for summons, reply drafting, appearance, and follow-up representation before GST authority.",
    templatePath: "/templates/summon-engagement-letter.docx",
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
    ],
    templateReplacements: [
      { search: "Neerja Modi School", value: (values) => stripFirmPrefix(cleanValue(values.clientName, "[Entity Name]")) },
      { search: "Superintendent", value: (values) => cleanValue(values.authority, "[Authority]") },
      { search: "Inquiry related to non-payment of GST on Input Services on RCM", value: (values) => cleanValue(values.issue, "[Summon Issue]") },
      { search: "Summon Stage", value: (values) => cleanValue(values.stage, "[Stage]") },
      { search: "75,000", value: (values) => cleanValue(values.feeBreakup, "[Fee Break-up]") },
      { search: "60%", value: (values) => cleanValue(values.advancePercent, "[Advance Payment]") },
      { search: "40%", value: (values) => cleanValue(values.balancePercent, "[Balance Payment]") },
      { search: "27-11-2024", value: (values) => formatDateForDocument(cleanValue(values.date, "[Date]")) },
      {
        search: "I                                         ",
        value: (values) => `I ${cleanValue(values.acknowledger, "[Acknowledged By]")}`
      },
      { search: "Place: Jaipur", value: (values) => `Place: ${cleanValue(values.place, "[Place]")}` },
      { search: "Place:", value: (values) => `Place: ${cleanValue(values.place, "[Place]")}` }
    ]
  }
];

export function cleanValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function stripFirmPrefix(value: string) {
  return value.replace(/^M\/s\.?\s*/i, "");
}

export function formatDateForDocument(value: string) {
  if (!value || value.startsWith("[")) {
    return value;
  }

  const [year, month, day] = value.split("-");

  if (year && month && day) {
    return `${day}-${month}-${year}`;
  }

  return value;
}

export function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function replaceAllXmlText(xml: string, search: string, replacement: string) {
  return xml.split(xmlEscape(search)).join(xmlEscape(replacement));
}

export function applyGstatFeeReplacements(xml: string, values: Record<string, string>) {
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

export async function downloadEngagementLetterDocx(
  format: EngagementFormat,
  values: Record<string, string>,
  fileNameBase?: string
) {
  if (!format.templatePath) {
    throw new Error("This engagement format has no Word template.");
  }

  const response = await fetch(format.templatePath);
  if (!response.ok) {
    throw new Error("Could not load the engagement letter template.");
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const documentXml = zip.file("word/document.xml");
  if (!documentXml) {
    throw new Error("The engagement letter template is missing document.xml.");
  }

  let xml = await documentXml.async("string");
  format.templateReplacements?.forEach((replacement) => {
    xml = replaceAllXmlText(xml, replacement.search, replacement.value(values));
  });
  if (format.id === "gstat-tribunal") {
    xml = applyGstatFeeReplacements(xml, values);
  }
  zip.file("word/document.xml", xml);

  const output = await zip.generateAsync({
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    type: "blob"
  });
  const url = URL.createObjectURL(output);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(fileNameBase ?? format.category).replace(/\s+/g, "-").replace(/\//g, "").toLowerCase()}-engagement-letter.docx`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Team-03 engagement letters: generated from the firm's own Word templates and
// drafted from a TaskLine row. Rules: no Document Period, EL No = Task Code,
// Place = Jaipur, Date = download date, Entity + GSTIN from the task, and any
// remaining [...] placeholder is highlighted yellow for the user to edit.
// ---------------------------------------------------------------------------
type Team03Format = {
  authoritySearch?: string;
  category: string;
  docNoSearch?: string;
  entitySearches: string[];
  gstinSearch?: string;
  id: string;
  issueSearch?: string;
  templatePath: string;
};

const team03Formats: Team03Format[] = [
  {
    category: "Specific Litigation",
    docNoSearch: "1899/12/296",
    entitySearches: ["M/s THINKING HATS ENTERTAINMENT SOLUTIONS PRIVATE", "M/s. Thinking Hats Entertainment Solutions Private", "Thinking Hats Entertainment Solutions Private"],
    id: "specific-litigation",
    templatePath: "/templates/team03/specific-litigation.docx"
  },
  {
    category: "General Litigation",
    entitySearches: [],
    id: "general-litigation",
    templatePath: "/templates/team03/general-litigation.docx"
  },
  {
    authoritySearch: "Chief Commissioner",
    category: "Audit Memo",
    entitySearches: ["BINARY INFOSOLUTIONS PRIVATE LIMITED", "M/s.Binary Infosoultions Private Limited", "Binary Infosoultions Private Limited"],
    gstinSearch: "08AAECB5959N1Z0",
    id: "audit-memo",
    templatePath: "/templates/team03/audit-memo.docx"
  },
  {
    authoritySearch: "Superintendent",
    category: "Summon",
    entitySearches: ["M/S NEERJA MODI SCHOOL", "M/s Neerja Modi School"],
    id: "summon",
    issueSearch: "Inquiry related to non-payment of GST on Input Services on RCM",
    templatePath: "/templates/team03/summon.docx"
  },
  {
    category: "GST Review",
    entitySearches: ["(Entity’s Name)", "(Entity's Name)"],
    id: "review",
    templatePath: "/templates/team03/review.docx"
  },
  {
    category: "Advisory and Compliance",
    entitySearches: ["(Entity’s Name)", "(Entity's Name)"],
    id: "advisory-compliance",
    templatePath: "/templates/team03/advisory-compliance.docx"
  },
  {
    category: "Compliance Professional Services",
    entitySearches: ["(Entity’s Name)", "(Entity's Name)"],
    id: "compliance-professional",
    templatePath: "/templates/team03/compliance-professional.docx"
  },
  {
    category: "Retainership",
    entitySearches: [],
    id: "retainership",
    templatePath: "/templates/team03/retainership.docx"
  }
];

// Keyword rules: pick the EL template from the task wording.
export function pickTeam03FormatId(task: string) {
  const value = String(task ?? "").toLowerCase();
  if (value.includes("summon")) return "summon";
  if (value.includes("audit") || value.includes("adt")) return "audit-memo";
  if (value.includes("scn")) return "specific-litigation";
  if (value.includes("review")) return "review";
  if (value.includes("retainer")) return "retainership";
  if (value.includes("advisory")) return "advisory-compliance";
  if (value.includes("registration") || value.includes("compliance") || value.includes("return") || value.includes("gstr")) {
    return "compliance-professional";
  }
  return "general-litigation";
}

function todayDdMmYyyy() {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric" }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

function removeDocumentPeriod(xml: string) {
  // Drop any table row that mentions Document Period (label + its value).
  let out = xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => (row.includes("Document Period") ? "" : row));
  out = out.replace(/Document Period/g, "");
  return out;
}

// Templates without their own Document No. row reuse the Document Period row
// for it: the label becomes "Document No." and the FY value becomes the EL No.
function repurposeDocumentPeriodRow(xml: string, elNo: string) {
  return xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    if (!row.includes("Document Period")) {
      return row;
    }
    let labelDone = false;
    let valueDone = false;
    return row.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (match, open: string, text: string, close: string) => {
      if (!labelDone) {
        if (text.includes("Document Period")) {
          labelDone = true;
          return `${open}${text.replace("Document Period", "Document No.")}${close}`;
        }
        return match;
      }
      if (!text.trim()) {
        return match;
      }
      if (!valueDone) {
        valueDone = true;
        return `${open}${xmlEscape(elNo)}${close}`;
      }
      return `${open}${close}`;
    });
  });
}

function setLabelledValue(xml: string, label: string, value: string) {
  // Rewrite whole "<label>: <value>" paragraphs, even when Word split the old
  // value across several runs (otherwise the stale value stays behind and the
  // letter shows e.g. "Date: 03-10-202620-12-2025").
  const startsWithLabel = new RegExp(`^\\s*${label}:`);
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para) => {
    const paragraphText = Array.from(para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g), (match) => match[1]).join("");
    if (!startsWithLabel.test(paragraphText)) {
      return para;
    }
    let labelSeen = false;
    return para.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (match, open: string, text: string, close: string) => {
      if (!labelSeen) {
        const at = text.indexOf(label);
        if (at < 0) {
          return match; // leading spacer runs stay untouched
        }
        labelSeen = true;
        return `${open}${text.slice(0, at)}${label}: ${xmlEscape(value)}${close}`;
      }
      return `${open}${close}`;
    });
  });
}

// Cover and "For" pages in some templates are blank underscore lines. Fill
// them as the firm writes them: "M/s <ENTITY>" in caps on the cover pages
// (before "Privileged and Confidential") and "M/s <Entity>" afterwards.
function fillStandaloneUnderscoreParagraphs(xml: string, entity: string) {
  const coverBoundary = xml.indexOf("Privileged and Confidential");
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para, offset: number) => {
    const paragraphText = Array.from(para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g), (match) => match[1]).join("");
    if (!/^\s*(For\s+)?[\s_]*_{4,}[\s_]*$/.test(paragraphText)) {
      return para;
    }
    const isCover = coverBoundary >= 0 && offset < coverBoundary;
    const value = `M/s ${isCover ? entity.toUpperCase() : entity}`;
    let filled = false;
    return para.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (match, open: string, text: string, close: string) => {
      if (!text.includes("_")) {
        return match;
      }
      if (filled) {
        return `${open}${close}`;
      }
      filled = true;
      return `${open}${xmlEscape(value)}${close}`;
    });
  });
}

function highlightBracketRuns(xml: string) {
  return xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) => {
    if (!/<w:t[^>]*>[^<]*\[[^<]*<\/w:t>/.test(run) || run.includes("<w:highlight")) {
      return run;
    }
    if (run.includes("<w:rPr>")) {
      return run.replace("<w:rPr>", '<w:rPr><w:highlight w:val="yellow"/>');
    }
    if (run.includes("<w:rPr/>")) {
      return run.replace("<w:rPr/>", '<w:rPr><w:highlight w:val="yellow"/></w:rPr>');
    }
    return run.replace(/(<w:r\b[^>]*>)/, '$1<w:rPr><w:highlight w:val="yellow"/></w:rPr>');
  });
}

export async function downloadTaskEngagementLetter(
  formatId: string,
  data: { entity: string; gstin: string; taskCode: string }
) {
  const format = team03Formats.find((item) => item.id === formatId) ?? team03Formats[1];

  const response = await fetch(format.templatePath);
  if (!response.ok) {
    throw new Error("Could not load the engagement letter template.");
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const documentXml = zip.file("word/document.xml");
  if (!documentXml) {
    throw new Error("The engagement letter template is missing document.xml.");
  }

  const entity = data.entity.trim() || "[Entity Name]";
  const gstin = data.gstin.trim() || "[GSTIN]";
  const elNo = data.taskCode.trim() || "[EL No]";
  let xml = await documentXml.async("string");

  // Entity name: underscore blanks, "(Entity's Name)", and any baked example
  // name. A search that carries an "M/s" prefix keeps that prefix, and an
  // all-caps example (the cover pages) gets the entity in caps too.
  xml = fillStandaloneUnderscoreParagraphs(xml, entity);
  xml = xml.replace(/_{6,}/g, xmlEscape(entity));
  for (const search of format.entitySearches) {
    const prefixMatch = search.match(/^M\/[sS]\.?\s*/);
    const core = prefixMatch ? search.slice(prefixMatch[0].length) : search;
    const coreIsUpper = /[A-Z]/.test(core) && core === core.toUpperCase();
    const replacement = `${prefixMatch ? prefixMatch[0] : ""}${coreIsUpper ? entity.toUpperCase() : entity}`;
    xml = replaceAllXmlText(xml, search, replacement);
  }
  // Entity work and any issue/authority become editable (highlighted) placeholders.
  xml = replaceAllXmlText(xml, "(Entity's Work)", "[Entity Work]");
  xml = replaceAllXmlText(xml, "(Entity’s Work)", "[Entity Work]");
  if (format.authoritySearch) {
    xml = replaceAllXmlText(xml, format.authoritySearch, "[Authority]");
  }
  if (format.issueSearch) {
    xml = replaceAllXmlText(xml, format.issueSearch, "[Issue]");
  }
  if (format.gstinSearch) {
    xml = replaceAllXmlText(xml, format.gstinSearch, gstin);
  }
  if (format.docNoSearch) {
    xml = replaceAllXmlText(xml, format.docNoSearch, elNo);
  }

  xml = format.docNoSearch ? removeDocumentPeriod(xml) : repurposeDocumentPeriodRow(xml, elNo);
  xml = setLabelledValue(xml, "Place", "Jaipur");
  xml = setLabelledValue(xml, "Date", todayDdMmYyyy());
  xml = highlightBracketRuns(xml);

  zip.file("word/document.xml", xml);

  const output = await zip.generateAsync({
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    type: "blob"
  });
  const url = URL.createObjectURL(output);
  const link = document.createElement("a");
  link.href = url;
  const safeEntity = (entity.replace(/[\\/:*?"<>|\[\]]/g, "").trim() || "entity").toLowerCase().replace(/\s+/g, "-");
  link.download = `${safeEntity}-${format.category.toLowerCase().replace(/\s+/g, "-")}-engagement-letter.docx`;
  link.click();
  URL.revokeObjectURL(url);
}
