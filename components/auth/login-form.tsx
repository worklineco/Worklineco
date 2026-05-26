"use client";

import { supabase } from "@/lib/supabase/client";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";

const organisationId = "DCO1433";
const roleOptions = ["Article Assistant", "Associate / Manager", "Senior Manager", "Partner", "Others"];
const teamOptions = [
  "Team 01",
  "Team 03",
  "Team 04",
  "Team 05",
  "Team 06",
  "Team 07",
  "Team 08",
  "Team 09",
  "Team 10",
  "Team 12"
];
const partnerOptions = [
  "Mr. Arvind Dhadda",
  "Mr. Yash Dhadda",
  "Mrs. Princy Dhadda",
  "Mr. Mudit Jain",
  "Mrs. Shuchi Sethi"
];
const inputClass =
  "mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100";

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState("");
  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupStep, setSignupStep] = useState<"details" | "emailOtp">("details");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "info">("info");
  const [isLoading, setIsLoading] = useState(false);

  const isValidOrg = orgId.trim().toUpperCase() === organisationId;
  const needsTeam = ["Article Assistant", "Associate / Manager", "Senior Manager"].includes(role);
  const needsPartner = role === "Partner";

  function changeMode(nextMode: "signin" | "signup") {
    setMode(nextMode);
    setMessage("");
    setMessageType("info");
    setSignupStep("details");
    setEmailOtp("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    setMessageType("info");

    if (mode === "signin") {
      const result = await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        setMessage(formatAuthMessage(result.error.message));
        setMessageType("error");
        setIsLoading(false);
        return;
      }

      if (result.data.session) {
        window.location.href = getRedirectPath();
        return;
      }

      setMessage("Signed in. Redirecting...");
      setMessageType("success");
      setIsLoading(false);
      return;
    }

    if (!isValidOrg) {
      setMessage("Invalid org. ID");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    if (!role || ((needsTeam || needsPartner) && !team)) {
      setMessage("Please select your role and team.");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const userData = {
      full_name: name,
      organisation_id: organisationId,
      role,
      team
    };

    if (signupStep === "details") {
      const result = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: userData,
          shouldCreateUser: true
        }
      });

      if (result.error) {
        setMessage(formatAuthMessage(result.error.message));
        setMessageType("error");
        setIsLoading(false);
        return;
      }

      setSignupStep("emailOtp");
      setMessage("Email OTP sent. Enter the OTP from your email to continue.");
      setMessageType("success");
      setIsLoading(false);
      return;
    }

    const verified = await supabase.auth.verifyOtp({
      email,
      token: emailOtp,
      type: "email"
    });

    if (verified.error) {
      setMessage(formatAuthMessage(verified.error.message));
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const updated = await supabase.auth.updateUser({
      data: userData,
      password
    });

    if (updated.error) {
      setMessage(formatAuthMessage(updated.error.message));
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    window.location.href = getRedirectPath();
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
          onClick={() => changeMode("signin")}
          type="button"
        >
          Sign in
        </button>
        <button
          className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${
            mode === "signup" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
          }`}
          onClick={() => changeMode("signup")}
          type="button"
        >
          Sign up
        </button>
      </div>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        {mode === "signup" ? (
          <>
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Name</span>
              <input
                className={inputClass}
                disabled={signupStep === "emailOtp"}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your full name"
                required
                value={name}
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Organisation ID</span>
              <input
                className={inputClass}
                disabled={signupStep === "emailOtp"}
                onChange={(event) => {
                  setOrgId(event.target.value.toUpperCase());
                  setRole("");
                  setTeam("");
                }}
                placeholder="DCO1433"
                required
                value={orgId}
              />
            </label>

            {orgId && !isValidOrg ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                Invalid org. ID
              </p>
            ) : null}

            {isValidOrg ? (
              <>
                <label className="block">
                  <span className="text-xs font-black uppercase text-slate-500">Role</span>
                  <select
                    className={inputClass}
                    disabled={signupStep === "emailOtp"}
                    onChange={(event) => {
                      setRole(event.target.value);
                      setTeam("");
                    }}
                    required
                    value={role}
                  >
                    <option value="">Select role</option>
                    {roleOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>

                {needsTeam || needsPartner ? (
                  <label className="block">
                    <span className="text-xs font-black uppercase text-slate-500">
                      {needsPartner ? "Partner" : "Team"}
                    </span>
                    <select
                      className={inputClass}
                      disabled={signupStep === "emailOtp"}
                      onChange={(event) => setTeam(event.target.value)}
                      required
                      value={team}
                    >
                      <option value="">{needsPartner ? "Select partner" : "Select team"}</option>
                      {(needsPartner ? partnerOptions : teamOptions).map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        <label className="block">
          <span className="text-xs font-black uppercase text-slate-500">Email ID</span>
          <input
            className={inputClass}
            disabled={signupStep === "emailOtp"}
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
              disabled={signupStep === "emailOtp"}
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

        {mode === "signup" && signupStep === "emailOtp" ? (
          <label className="block">
            <span className="text-xs font-black uppercase text-slate-500">Email OTP</span>
            <input
              className={inputClass}
              inputMode="numeric"
              onChange={(event) => setEmailOtp(event.target.value)}
              placeholder="Enter OTP from email"
              required
              value={emailOtp}
            />
          </label>
        ) : null}

        <button
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          disabled={isLoading || (mode === "signup" && Boolean(orgId) && !isValidOrg)}
          type="submit"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "signin"
            ? "Sign in"
            : signupStep === "details"
              ? "Send email OTP"
              : "Verify OTP and create account"}
          {!isLoading ? <ArrowRight className="size-4" /> : null}
        </button>

        <p className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-900">
          {mode === "signin"
            ? "Use your email ID and password to access WorkLine Co."
            : "Signup is currently limited to organisation ID DCO1433 and requires email OTP verification first."}
        </p>

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

function getRedirectPath() {
  const params = new URLSearchParams(window.location.search);
  const nextPath = params.get("next");

  if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/onboarding";
}

function formatAuthMessage(message: string) {
  if (message.toLowerCase().includes("security purposes")) {
    return "Supabase has temporarily paused repeated signup attempts for this email. Please wait for the countdown, then try again.";
  }

  if (message.toLowerCase().includes("email rate limit")) {
    return "Supabase built-in email sending limit is active. For scale, connect custom SMTP before using email confirmation or OTP.";
  }

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Invalid login credentials. If you deleted this user in Supabase, create the account again from the Sign up tab.";
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
