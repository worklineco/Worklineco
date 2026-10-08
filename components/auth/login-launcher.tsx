"use client";

import { LogIn, X } from "lucide-react";
import { useState } from "react";
import { LoginForm } from "./login-form";

export function LoginLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex items-center gap-2 rounded-xl bg-navy-700 px-5 py-2.5 text-sm font-black text-white shadow-lg transition hover:bg-navy-800"
        onClick={() => setOpen(true)}
        type="button"
      >
        <LogIn className="size-4" />
        Login
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <button
            aria-label="Close login"
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="relative z-10 w-full max-w-md">
            <button
              aria-label="Close login"
              className="absolute -right-2 -top-2 z-20 flex size-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition hover:bg-slate-100"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X className="size-4" />
            </button>
            <LoginForm />
          </div>
        </div>
      ) : null}
    </>
  );
}
