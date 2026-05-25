"use client";

import { supabase } from "@/lib/supabase/client";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "info">("info");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    setMessageType("info");

    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`
            },
            password
          });

    if (result.error) {
      setMessage(formatAuthMessage(result.error.message));
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    setMessage(
      mode === "signin"
        ? "Signed in. Dashboard routing will be added in the next build."
        : "Account request created. Please open the confirmation email from Supabase, then come back and sign in."
    );
    if (mode === "signup") {
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
    setMessageType("success");
    setIsLoading(false);
  }

  async function resendConfirmation() {
    if (!email) {
      setMessage("Enter your email ID first, then request the confirmation email.");
      setMessageType("error");
      return;
    }

    setIsResending(true);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setMessage("");

    const { error } = await supabase.auth.resend({
      email,
      type: "signup"
    });

    if (error) {
      setMessage(formatAuthMessage(error.message));
      setMessageType("error");
      setIsResending(false);
      return;
    }

    setMessage("Confirmation email sent again. Please check inbox and spam folder.");
    setMessageType("success");
    setIsResending(false);
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
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "signin" ? "Sign in" : "Create account"}
          {!isLoading ? <ArrowRight className="size-4" /> : null}
        </button>

        <p className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-900">
          Use your email as the user ID. New accounts must confirm their email
          before sign in because Supabase email auto-confirm is currently off.
        </p>

        {mode === "signin" ? (
          <button
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isResending || resendCooldown > 0}
            onClick={resendConfirmation}
            type="button"
          >
            {isResending
              ? "Sending confirmation..."
              : resendCooldown > 0
                ? `Try again in ${resendCooldown}s`
                : "Resend confirmation email"}
          </button>
        ) : null}

        {message ? (
          <div
            className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-bold leading-5 ${messageTone(
              messageType
            )}`}
          >
            {messageType === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <p>{message}</p>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function formatAuthMessage(message: string) {
  if (message.toLowerCase().includes("security purposes")) {
    return "Supabase has temporarily paused repeated signup attempts for this email. Please wait for the countdown, then try again.";
  }

  if (message.toLowerCase().includes("email rate limit")) {
    return "Supabase email sending limit is active. Please wait before requesting another confirmation email, or confirm this test user from the Supabase dashboard.";
  }

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Invalid login credentials. If this account was just created, confirm the email first, then try signing in again.";
  }

  return message;
}

function messageTone(type: "error" | "success" | "info") {
  if (type === "success") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (type === "error") {
    return "border border-rose-200 bg-rose-50 text-rose-900";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700";
}
