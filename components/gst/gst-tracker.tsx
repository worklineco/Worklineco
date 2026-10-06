"use client";

// GST Tracker — cleared to a blank slate on request, ready to be rebuilt.
// Tell me what this tab should do and I'll build it up from here.
export function GstTracker() {
  return (
    <div className="mt-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-navy-600">GST Tracker</p>
        <h1 className="mt-2 text-2xl font-black text-navy-900">A fresh start</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
          This tab has been cleared so we can build the GST Tracker from scratch. Tell me what you
          want it to do and I&apos;ll start building here.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
        <p className="text-sm font-bold text-slate-400">Nothing here yet — ready to build.</p>
      </div>
    </div>
  );
}
