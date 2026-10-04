import { ArrowLeft, Download, FileText, ScrollText } from "lucide-react";
import Link from "next/link";

// Standard Power of Attorney formats, downloadable by anyone on the team.
// The Word files live in public/poa/ and open directly in Word for filling
// in the party, authority, and matter details.
const poaFormats = [
  {
    description: "Authorization to submit, appear and plead in GST appeal proceedings before the appellate authority.",
    file: "/poa/poa-appeal.docx",
    filename: "POA - Appeal.docx",
    label: "POA — Appeal",
    type: "Word (.docx)"
  },
  {
    description: "Authorization for GST audit proceedings initiated under ADT-01 before the audit officer.",
    file: "/poa/poa-adt-01.docx",
    filename: "POA - ADT-01 Audit.docx",
    label: "POA — ADT-01 (Audit)",
    type: "Word (.docx)"
  },
  {
    description: "Authorization to reply, appear and plead in show cause notice proceedings.",
    file: "/poa/poa-scn.docx",
    filename: "POA - SCN.docx",
    label: "POA — Show Cause Notice",
    type: "Word (.docx)"
  },
  {
    description: "Authorization for proceedings before the Directorate General of GST Intelligence.",
    file: "/poa/poa-dggi.doc",
    filename: "POA - DGGI.doc",
    label: "POA — DGGI",
    type: "Word (.doc)"
  }
];

export default function PowerOfAttorneyPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 " />

      <section className="mx-auto max-w-[1540px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black uppercase text-amber-800">
                <ScrollText className="size-3.5" />
                Power of Attorney
              </div>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">Power of Attorney</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Download the firm&apos;s standard Power of Attorney formats, fill in the party and matter details, and use them as-is.
              </p>
            </div>

            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy-700 px-4 text-sm font-black text-white"
              href="/tools"
            >
              <ArrowLeft className="size-4" />
              Tools
            </Link>
          </div>
        </header>

        <section className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {poaFormats.map((format) => (
            <div
              className="flex flex-col rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]"
              key={format.label}
            >
              <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                <FileText className="size-6" />
              </div>
              <h2 className="mt-5 text-xl font-black text-slate-950">{format.label}</h2>
              <p className="mt-2 flex-1 text-sm font-semibold leading-6 text-slate-600">{format.description}</p>
              <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-400">{format.type}</p>
              <a
                className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy-700 px-4 text-sm font-black text-white transition hover:bg-navy-800"
                download={format.filename}
                href={format.file}
                title={`Download the ${format.label} format`}
              >
                <Download className="size-4" />
                Download
              </a>
            </div>
          ))}
        </section>

        <section className="mt-5 rounded-[28px] border border-dashed border-slate-300 bg-white/80 p-5 text-sm font-semibold leading-6 text-slate-600">
          Before use: update the authority and address block, the party name, address and GSTIN, the list of authorized
          representatives, and the matter reference. Print on the letterhead or stamp paper as applicable and get it signed
          by the authorized signatory.
        </section>
      </section>
    </main>
  );
}
