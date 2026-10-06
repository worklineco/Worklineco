import Link from "next/link";
import { ArrowLeft, Wrench } from "lucide-react";

export function GstTracker() {
  return (
    <section className="mt-6 flex min-h-[65vh] flex-col rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-navy-600">GST Tracker</p>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-8 text-center">
        <MaintenanceIllustration />
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
          <Wrench aria-hidden="true" className="size-3.5" />
          Under maintenance
        </span>
        <h1 className="mt-5 text-2xl font-black tracking-tight text-navy-900 sm:text-3xl">
          This feature will be available soon.
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-500 sm:text-base">
          We’re getting the GST Tracker ready for you. Thank you for your patience.
        </p>
        <Link className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-navy-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy-600" href="/partner-dashboard">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}

function MaintenanceIllustration() {
  return (
    <svg className="h-auto w-full max-w-[300px]" viewBox="0 0 320 220" role="img" aria-label="A workspace screen with a maintenance wrench and safety cone">
      <ellipse cx="160" cy="199" rx="137" ry="12" fill="#f1f5f9" />
      <circle cx="161" cy="104" r="94" fill="#f4f6fa" />
      <circle cx="273" cy="49" r="8" fill="#ccfbf1" />
      <circle cx="47" cy="87" r="5" fill="#fde68a" />
      <path d="M263 104h12m-6-6v12M49 39h10m-5-5v10" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      <rect x="61" y="47" width="200" height="133" rx="13" fill="white" stroke="#1d2b5b" strokeWidth="4" />
      <path d="M63 74h196" stroke="#e2e8f0" strokeWidth="2" />
      <circle cx="78" cy="61" r="3" fill="#fbbf24" />
      <circle cx="89" cy="61" r="3" fill="#5eead4" />
      <circle cx="100" cy="61" r="3" fill="#cbd5e1" />
      <rect x="79" y="92" width="56" height="67" rx="6" fill="#eff6ff" />
      <path d="M91 106h31m-31 12h23m-23 12h28m-28 12h18" stroke="#b6c5e4" strokeWidth="4" strokeLinecap="round" />
      <circle cx="193" cy="122" r="34" fill="#ecfdf5" />
      <path d="M211 96a17 17 0 0 0-22 20l-21 21a7 7 0 0 0 10 10l21-21a17 17 0 0 0 20-22l-11 11-10-10 13-9Z" fill="#1d2b5b" stroke="#1d2b5b" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="175" cy="140" r="2.5" fill="white" />
      <path d="M151 182v15m21-15v15m-36 1h51" stroke="#1d2b5b" strokeWidth="4" strokeLinecap="round" />
      <path d="m265 147 21 46h-43l22-46Z" fill="#fbbf24" stroke="#d97706" strokeWidth="2" strokeLinejoin="round" />
      <path d="M257 165h16l5 11h-26Z" fill="white" />
      <rect x="236" y="192" width="57" height="7" rx="3.5" fill="#1d2b5b" />
      <path d="M38 176h17m-8-8v16" stroke="#5eead4" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
