"use client";

import { supabase } from "@/lib/supabase/client";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

const organisationId = "DCO1433";
const roleOptions = ["Article Assistant", "Associate", "Senior Associate", "Manager", "Senior Manager", "Partner", "Accounts", "Others"];
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
const teamEmailByName: Record<string, string> = {
  "Team 01": "team01.dco@gmail.com",
  "Team 03": "team03.dco@gmail.com",
  "Team 04": "team04.dco@gmail.com",
  "Team 05": "team05.dco@gmail.com",
  "Team 06": "team06.dco@gmail.com",
  "Team 07": "team07.dco@gmail.com",
  "Team 08": "team08.dco@gmail.com",
  "Team 09": "team09.dco@gmail.com",
  "Team 10": "team10.dco@gmail.com",
  "Team 12": "team12.dco@gmail.com"
};
const partnerOptions = [
  "Mr. Arvind Dhadda",
  "Mr. Yash Dhadda",
  "Mrs. Princy Dhadda",
  "Mr. Mudit Jain",
  "Mrs. Shuchi Sethi"
];
type PartnerApprover = {
  id: string;
  name: string;
};
const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-navy-400 focus:ring-4 focus:ring-navy-100";
type AuthMode = "reset" | "signin" | "signup";
type ResetStep = "email" | "password" | "otp";

export function LoginForm() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState("");
  const [approverId, setApproverId] = useState("");
  const [partnerApprovers, setPartnerApprovers] = useState<PartnerApprover[]>([]);
  const [partnerLoadError, setPartnerLoadError] = useState("");
  const [isLoadingPartners, setIsLoadingPartners] = useState(false);
  const [joiningDate, setJoiningDate] = useState("");
  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [teamOtp, setTeamOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetStep, setResetStep] = useState<ResetStep>("email");
  const [showPassword, setShowPassword] = useState(false);
  const [signupStep, setSignupStep] = useState<"details" | "emailOtp" | "teamOtp">("details");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "info">("info");
  const [isLoading, setIsLoading] = useState(false);

  const isValidOrg = orgId.trim().toUpperCase() === organisationId;
  const needsTeam = ["Article Assistant", "Associate", "Senior Associate", "Manager", "Senior Manager"].includes(role);
  const needsPartner = role === "Partner";
  const needsPartnerApproval = role === "Others";
  const needsAccountsApproval = role === "Accounts";
  const selectedApprover = partnerApprovers.find((partner) => partner.id === approverId);
  const teamEmail = needsTeam
    ? teamEmailByName[team]
    : needsAccountsApproval
      ? "commercials.dco@gmail.com"
      : "";
  const approvalLabel = needsPartnerApproval
    ? selectedApprover?.name ?? "Partner approval"
    : needsAccountsApproval
      ? "Accounts access"
      : team;

  useEffect(() => {
    if (!needsPartnerApproval) {
      setApproverId("");
      setPartnerApprovers([]);
      setPartnerLoadError("");
      return;
    }

    const controller = new AbortController();

    async function loadPartnerApprovers() {
      setIsLoadingPartners(true);
      setPartnerLoadError("");

      try {
        const response = await fetch("/api/auth/partner-options", {
          cache: "no-store",
          signal: controller.signal
        });
        const result = (await response.json()) as {
          error?: string;
          partners?: PartnerApprover[];
        };

        if (!response.ok) {
          throw new Error(result.error ?? "Could not load approved partners.");
        }

        setPartnerApprovers(result.partners ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setPartnerApprovers([]);
        setPartnerLoadError(
          error instanceof Error ? error.message : "Could not load approved partners."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingPartners(false);
        }
      }
    }

    void loadPartnerApprovers();
    return () => controller.abort();
  }, [needsPartnerApproval]);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage("");
    setMessageType("info");
    setSignupStep("details");
    setEmailOtp("");
    setTeamOtp("");
    setApproverId("");
    setPassword("");
    setConfirmPassword("");
    setResetOtp("");
    setResetStep("email");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    setMessageType("info");

    if (mode === "reset") {
      if (resetStep === "email") {
        setResetStep("password");
        setMessage("Choose and confirm your new password. We will then send an OTP to your email.");
        setMessageType("info");
        setIsLoading(false);
        return;
      }

      if (resetStep === "password") {
        if (password.length < 6) {
          setMessage("Password must contain at least 6 characters.");
          setMessageType("error");
          setIsLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          setMessage("The new passwords do not match.");
          setMessageType("error");
          setIsLoading(false);
          return;
        }

        const otpResult = await sendOtp({
          email,
          label: "password reset",
          purpose: "password-reset"
        });

        if (!otpResult.ok) {
          setMessage(otpResult.error);
          setMessageType("error");
          setIsLoading(false);
          return;
        }

        setResetStep("otp");
        setMessage("Password-reset OTP sent. Enter the 6-digit OTP to confirm the change.");
        setMessageType("success");
        setIsLoading(false);
        return;
      }

      const verified = await verifyOtp({
        email,
        otp: resetOtp,
        purpose: "password-reset"
      });

      if (!verified.ok) {
        setMessage(verified.error);
        setMessageType("error");
        setIsLoading(false);
        return;
      }

      const resetResult = await resetPassword({ email, password });

      if (!resetResult.ok) {
        setMessage(resetResult.error);
        setMessageType("error");
        setIsLoading(false);
        return;
      }

      changeMode("signin");
      setMessage("Password updated. Sign in with your new password.");
      setMessageType("success");
      setIsLoading(false);
      return;
    }

    if (mode === "signin") {
      const result = await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        setMessage(formatAuthMessage(result.error.message));
        setMessageType("error");
        setIsLoading(false);
        return;
      }

      if (result.data.session) {
        const defaultPath = getDefaultSignedInPath();
        window.location.href = getRedirectPath(defaultPath);
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

    if (
      !role ||
      ((needsTeam || needsPartner) && !team) ||
      (needsPartnerApproval && !approverId)
    ) {
      setMessage("Please select all required role and approval details.");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const userData: Record<string, string> = {
      full_name: name,
      joining_date: joiningDate,
      organisation_id: organisationId,
      role,
      team
    };

    if (needsPartnerApproval && selectedApprover) {
      userData.approving_partner = selectedApprover.name;
    }

    if (signupStep === "details") {
      const result = await sendOtp({
        email,
        label: name,
        purpose: "signup-email"
      });

      if (!result.ok) {
        setMessage(result.error);
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

    if (signupStep === "emailOtp") {
      const verified = await verifyOtp({
        email,
        otp: emailOtp,
        purpose: "signup-email"
      });

      if (!verified.ok) {
        setMessage(verified.error);
        setMessageType("error");
        setIsLoading(false);
        return;
      }

      if (teamEmail || needsPartnerApproval) {
        const teamOtpResult = await sendOtp({
          approverId: needsPartnerApproval ? approverId : undefined,
          email: needsPartnerApproval ? undefined : teamEmail,
          label: approvalLabel,
          purpose: "team"
        });

        if (!teamOtpResult.ok) {
          setMessage(teamOtpResult.error);
          setMessageType("error");
          setIsLoading(false);
          return;
        }

        setSignupStep("teamOtp");
        setMessage(
          needsPartnerApproval
            ? `Approval OTP sent to ${selectedApprover?.name ?? "the selected partner"}.`
            : `Approval OTP sent to ${teamEmail}.`
        );
        setMessageType("success");
        setIsLoading(false);
        return;
      }

      const completed = await completeSignup({
        approverId: needsPartnerApproval ? approverId : undefined,
        email,
        metadata: userData,
        password,
        teamEmail
      });

      if (!completed.ok) {
        setMessage(completed.error);
        setMessageType("error");
        setIsLoading(false);
      }

      return;
    }

    const teamVerified = await verifyOtp({
      approverId: needsPartnerApproval ? approverId : undefined,
      email: needsPartnerApproval ? undefined : teamEmail,
      otp: teamOtp,
      purpose: "team"
    });

    if (!teamVerified.ok) {
      setMessage(teamVerified.error);
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const completed = await completeSignup({
      approverId: needsPartnerApproval ? approverId : undefined,
      email,
      metadata: userData,
      password,
      teamEmail
    });

    if (!completed.ok) {
      setMessage(completed.error);
      setMessageType("error");
      setIsLoading(false);
    }
  }

  return (
    <section className="workline-frame max-h-full self-center overflow-y-auto rounded-[24px] p-4 sm:p-5">
      <div className="rounded-2xl border border-white/15 p-4 text-white shadow-[0_14px_38px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-navy-100">
              WorkLine secure access
            </p>
            <h2 className="mt-1 text-xl font-black">
              {mode === "signin"
                ? "Welcome back"
                : mode === "signup"
                  ? "Join your workspace"
                  : resetStep === "email"
                    ? "Reset password"
                    : resetStep === "password"
                      ? "Choose a new password"
                      : "Verify reset OTP"}
            </h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-white/75">
              {mode === "signin"
                ? "Continue to your firm dashboard."
                : mode === "signup"
                  ? "Verified access for approved firm members."
                  : resetStep === "email"
                    ? "Enter your registered email ID."
                    : resetStep === "password"
                      ? "Enter and confirm your new password."
                      : "Enter the OTP sent to your email."}
            </p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-white text-sm font-black text-slate-950 shadow-lg shadow-slate-950/20">
            WL
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1 shadow-inner">
        <button
          className={`rounded-lg px-3 py-2 text-sm font-black transition ${
            mode === "signin" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
          onClick={() => changeMode("signin")}
          type="button"
        >
          Sign in
        </button>
        <button
          className={`rounded-lg px-3 py-2 text-sm font-black transition ${
            mode === "signup" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
          onClick={() => changeMode("signup")}
          type="button"
        >
          Sign up
        </button>
      </div>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        {mode === "signup" ? (
          <>
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Name</span>
              <input
                className={inputClass}
                disabled={signupStep !== "details"}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your full name"
                required
                value={name}
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Joining Date</span>
              <input
                className={inputClass}
                disabled={signupStep !== "details"}
                onChange={(event) => setJoiningDate(event.target.value)}
                required
                type="date"
                value={joiningDate}
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Organisation ID</span>
              <input
                className={inputClass}
                disabled={signupStep !== "details"}
                onChange={(event) => {
                  setOrgId(event.target.value.toUpperCase());
                  setRole("");
                  setTeam("");
                }}
                placeholder="Enter organisation ID"
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
                    disabled={signupStep !== "details"}
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
                      disabled={signupStep !== "details"}
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

                {needsPartnerApproval ? (
                  <label className="block">
                    <span className="text-xs font-black uppercase text-slate-500">
                      Approving Partner
                    </span>
                    <select
                      className={inputClass}
                      disabled={signupStep !== "details" || isLoadingPartners}
                      onChange={(event) => setApproverId(event.target.value)}
                      required
                      value={approverId}
                    >
                      <option value="">
                        {isLoadingPartners ? "Loading approved partners..." : "Select partner"}
                      </option>
                      {partnerApprovers.map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.name}
                        </option>
                      ))}
                    </select>
                    {partnerLoadError ? (
                      <span className="mt-1 block text-xs font-bold text-rose-700">
                        {partnerLoadError}
                      </span>
                    ) : null}
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
            disabled={
              (mode === "signup" && signupStep !== "details") ||
              (mode === "reset" && resetStep !== "email")
            }
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@firm.com"
            required
            type="email"
            value={email}
          />
        </label>

        {mode !== "reset" || resetStep === "password" ? (
          <label className="block">
            <span className="flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase text-slate-500">
                {mode === "reset" ? "New Password" : "Password"}
              </span>
              {mode === "signin" ? (
                <button
                  className="text-xs font-black text-navy-700 transition hover:text-navy-900 hover:underline"
                  onClick={() => changeMode("reset")}
                  type="button"
                >
                  Forgot password?
                </button>
              ) : null}
            </span>
            <div className="mt-1.5 flex h-11 items-center rounded-xl border border-slate-200 bg-white pr-2 transition focus-within:border-navy-400 focus-within:ring-4 focus-within:ring-navy-100">
              <input
                className="h-full min-w-0 flex-1 rounded-xl border-0 bg-transparent px-3 text-sm font-semibold outline-none"
                disabled={signupStep !== "details"}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 6 characters"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
        ) : null}

        {mode === "reset" && resetStep === "password" ? (
          <label className="block">
            <span className="text-xs font-black uppercase text-slate-500">Confirm New Password</span>
            <input
              className={inputClass}
              minLength={6}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your new password"
              required
              type="password"
              value={confirmPassword}
            />
          </label>
        ) : null}

        {mode === "reset" && resetStep === "otp" ? (
          <label className="block">
            <span className="text-xs font-black uppercase text-slate-500">Password-reset OTP</span>
            <input
              autoComplete="one-time-code"
              className={inputClass}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setResetOtp(event.target.value.replace(/\\D/g, "").slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              required
              value={resetOtp}
            />
          </label>
        ) : null}

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

        {mode === "signup" && signupStep === "teamOtp" ? (
          <label className="block">
            <span className="text-xs font-black uppercase text-slate-500">Approval OTP</span>
            <input
              className={inputClass}
              inputMode="numeric"
              onChange={(event) => setTeamOtp(event.target.value)}
              placeholder={`Enter OTP sent to ${teamEmail}`}
              required
              value={teamOtp}
            />
          </label>
        ) : null}

        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy-700 text-sm font-black text-white shadow-[0_14px_34px_rgba(15,23,42,0.24)] transition hover:-translate-y-0.5 hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          disabled={
            isLoading ||
            (mode === "signup" && Boolean(orgId) && !isValidOrg) ||
            (mode === "reset" && resetStep === "password" && password !== confirmPassword)
          }
          type="submit"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "signin"
            ? "Sign in"
            : mode === "reset"
              ? resetStep === "email"
                ? "Continue"
                : resetStep === "password"
                  ? "Send OTP"
                  : "Verify OTP and reset password"
              : signupStep === "details"
                ? "Send email OTP"
                : signupStep === "emailOtp"
                  ? "Verify email OTP"
                  : "Verify approval OTP and create account"}
          {!isLoading ? <ArrowRight className="size-4" /> : null}
        </button>

        {mode === "signin" ? (
          <p className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-900">
            Use your email ID and password to access WorkLine Co.
          </p>
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

async function completeSignup({
  approverId,
  email,
  metadata,
  password,
  teamEmail
}: {
  approverId?: string;
  email: string;
  metadata: Record<string, string>;
  password: string;
  teamEmail: string;
}) {
  const response = await fetch("/api/auth/complete-signup", {
    body: JSON.stringify({ approverId, email, metadata, password, teamEmail }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const result = (await response.json()) as { error?: string; ok?: boolean };

  if (!response.ok || !result.ok) {
    return { error: result.error ?? "Could not complete signup.", ok: false as const };
  }

  const signin = await supabase.auth.signInWithPassword({ email, password });

  if (signin.error) {
    return { error: formatAuthMessage(signin.error.message), ok: false as const };
  }

  window.location.href = getRedirectPath("/onboarding");
  return { ok: true as const };
}

function getDefaultSignedInPath() {
  return "/partner-dashboard";
}

function getRedirectPath(defaultPath: string) {
  const params = new URLSearchParams(window.location.search);
  const nextPath = params.get("next");

  if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return defaultPath;
}

async function resetPassword({ email, password }: { email: string; password: string }) {
  const response = await fetch("/api/auth/reset-password", {
    body: JSON.stringify({ email, password }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const result = (await response.json()) as { error?: string; ok?: boolean };

  return response.ok && result.ok
    ? { ok: true as const }
    : { error: result.error ?? "Could not reset password.", ok: false as const };
}

async function sendOtp({
  approverId,
  email,
  label,
  purpose
}: {
  approverId?: string;
  email?: string;
  label: string;
  purpose: string;
}) {
  const response = await fetch("/api/auth/send-otp", {
    body: JSON.stringify({ approverId, email, label, purpose }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const result = (await response.json()) as { error?: string; ok?: boolean };

  return response.ok && result.ok
    ? { ok: true as const }
    : { error: result.error ?? "Could not send OTP.", ok: false as const };
}

async function verifyOtp({
  approverId,
  email,
  otp,
  purpose
}: {
  approverId?: string;
  email?: string;
  otp: string;
  purpose: string;
}) {
  const response = await fetch("/api/auth/verify-otp", {
    body: JSON.stringify({ approverId, email, otp, purpose }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const result = (await response.json()) as { error?: string; ok?: boolean };

  return response.ok && result.ok
    ? { ok: true as const }
    : { error: result.error ?? "Invalid OTP.", ok: false as const };
}

function formatAuthMessage(message: string) {
  if (message.toLowerCase().includes("security purposes")) {
    return "Supabase has temporarily paused repeated signup attempts for this email. Please wait for the countdown, then try again.";
  }

  if (message.toLowerCase().includes("email rate limit")) {
    return "Supabase built-in email sending limit is active. For scale, connect custom SMTP before using email confirmation or OTP.";
  }

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Invalid email ID or password.";
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
