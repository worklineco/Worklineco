import { ArrowLeft, FileSearch, FileText, Mic, ScrollText, Wrench } from "lucide-react";
import Link from "next/link";

const tools = [
  {
    description: "Generate and track engagement letters with saved formats and generated EL log.",
    href: "/engagement-letter",
    icon: FileText,
    label: "Engagement Letter",
    tone: "bg-cyan-100 text-cyan-800"
  },
  {
    description: "Index PDF files, organize documents, and work with PDF utilities.",
    href: "/pdf-indexing",
    icon: FileSearch,
    label: "PDF & Indexing",
    tone: "bg-indigo-100 text-indigo-800"
  },
  {
    description: "Prepare and manage Power of Attorney drafts and related records.",
    href: "/power-of-attorney",
    icon: ScrollText,
    label: "Power of Attorney",
    tone: "bg-amber-100 text-amber-800"
  },
  {
    description: "Record meeting speech, review the transcript, and generate structured minutes.",
    href: "/minutes-of-meeting",
    icon: Mic,
    label: "Minutes of Meeting",
    tone: "bg-emerald-100 text-emerald-800"
  }
];

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(99,102,241,0.13),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(6,182,212,0.12),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.13),transparent_34%)]" />

      <section className="mx-auto max-w-[1540px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-black uppercase text-indigo-800">
                <Wrench className="size-3.5" />
                Tools
              </div>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">Tools</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Access document and drafting utilities from one workspace.
              </p>
            </div>

            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Workspace
            </Link>
          </div>
        </header>

        <section className="mt-5 grid gap-5 md:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;

            return (
              <Link
                className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_90px_rgba(15,23,42,0.14)]"
                href={tool.href}
                key={tool.label}
              >
                <div className={`flex size-12 items-center justify-center rounded-2xl ${tool.tone}`}>
                  <Icon className="size-6" />
                </div>
                <h2 className="mt-5 text-2xl font-black text-slate-950">{tool.label}</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{tool.description}</p>
              </Link>
            );
          })}
        </section>
      </section>
    </main>
  );
}
