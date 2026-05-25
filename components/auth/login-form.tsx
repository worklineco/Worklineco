"use client";

import { supabase } from "@/lib/supabase/client";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setMessage(result.error.message);
      setIsLoading(false);
      return;
    }

    setMessage(
      mode === "signin"
        ? "Signed in. Dashboard routing will be added in the next build."
        : "Account created. Check email confirmation settings in Supabase if required."
    );
    setIsLoading(false);
  }

  return (
    <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur sm:p-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-5 text-white">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-200">
              Secure access
            </p>
            <h2 className="mt-2 text-2xl font-black">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </h2>
          </div>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-950">
            WL
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
        <button
          className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${
            mode === "signin" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
          }`}
          onClick={() => setMode("signin")}
          type="button"
        >
          Sign in
        </button>
        <button
          className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${
            mode === "signup" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
          }`}
          onClick={() => setMode("signup")}
          type="button"
        >
          Sign up
        </button>
      </div>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-xs font-black uppercase text-slate-500">Email ID</span>
          <input
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@firm.com"
            required
            type="email"
            value={email}
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase text-slate-500">Password</span>
          <div className="mt-2 flex h-12 items-center rounded-2xl border border-slate-200 bg-white pr-2 transition focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100">
            <input
              className="h-full min-w-0 flex-1 rounded-2xl border-0 bg-transparent px-4 text-sm font-semibold outline-none"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 characters"
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
              onClick={() => setShowPassword((current) => !current)}
              type="button"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </label>

        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 via-sky-600 to-fuchsia-600 text-sm font-black text-white shadow-lg shadow-sky-900/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "signin" ? "Sign in" : "Create account"}
          {!isLoading ? <ArrowRight className="size-4" /> : null}
        </button>

        {message ? (
          <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
