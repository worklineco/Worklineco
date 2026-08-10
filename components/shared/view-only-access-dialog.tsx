"use client";

import { LockKeyhole, X } from "lucide-react";
import { useEffect } from "react";

export function ViewOnlyAccessDialog({
  onClose,
  open
}: {
  onClose: () => void;
  open: boolean;
}) {
  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      aria-labelledby="view-only-access-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-950/35 p-4 backdrop-blur-[2px]"
      role="dialog"
    >
      <button
        aria-label="Close view-only access message"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <button
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>

        <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
          <LockKeyhole className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-black text-slate-950" id="view-only-access-title">
          View-only access
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          Please contact your Manager to request editing access.
        </p>
        <button
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-navy-700 px-4 text-sm font-black text-white transition hover:bg-navy-800"
          onClick={onClose}
          type="button"
        >
          Okay
        </button>
      </div>
    </div>
  );
}
