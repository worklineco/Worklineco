import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export async function POST(request: Request) {
  const { approverId, email, otp, purpose } = (await request.json()) as {
    approverId?: string;
    email?: string;
    otp?: string;
    purpose?: string;
  };

  if (!otp || !purpose || (!email && !approverId)) {
    return NextResponse.json(
      { error: "OTP, purpose, and verification target are required." },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const cookieName = otpCookieName(purpose);
  const savedOtp = cookieStore.get(cookieName)?.value;

  if (!savedOtp) {
    return NextResponse.json({ error: "OTP expired. Please request a new OTP." }, { status: 400 });
  }

  const saved = JSON.parse(Buffer.from(savedOtp, "base64url").toString("utf8")) as {
    approverId?: string;
    email: string;
    expiresAt: number;
    hash: string;
    otp?: string;
  };
  const normalizedEmail = saved.approverId
    ? saved.email
    : email?.trim().toLowerCase() ?? "";
  const normalizedOtp = otp.trim();
  const approverMismatch =
    Boolean(saved.approverId) &&
    (purpose !== "team" || saved.approverId !== approverId);
  const unexpectedApprover = !saved.approverId && Boolean(approverId);

  if (
    !normalizedEmail ||
    saved.email !== normalizedEmail ||
    approverMismatch ||
    unexpectedApprover ||
    saved.expiresAt < Date.now()
  ) {
    return NextResponse.json({ error: "OTP expired. Please request a new OTP." }, { status: 400 });
  }

  const expectedHash = signOtp({
    email: normalizedEmail,
    expiresAt: saved.expiresAt,
    otp: normalizedOtp,
    purpose
  });

  const isValidSignedOtp = safeEqual(saved.hash, expectedHash);
  const isValidCookieOtp = saved.otp ? safeEqual(saved.otp, normalizedOtp) : false;
  const isValidOtp =
    purpose === "password-reset" ? isValidSignedOtp : isValidSignedOtp || isValidCookieOtp;

  if (!isValidOtp) {
    return NextResponse.json({ error: "Invalid OTP." }, { status: 400 });
  }

  cookieStore.delete(cookieName);
  const verifiedValue =
    purpose === "password-reset"
      ? createVerifiedProof({ email: normalizedEmail, purpose })
      : normalizedEmail;
  cookieStore.set(verifiedCookieName(purpose), verifiedValue, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return NextResponse.json({ ok: true });
}

function otpCookieName(purpose: string) {
  return `wl_${purpose.replace(/[^a-z0-9-]/gi, "")}_otp`;
}

function verifiedCookieName(purpose: string) {
  return `wl_${purpose.replace(/[^a-z0-9-]/gi, "")}_verified`;
}

function signOtp({
  email,
  expiresAt,
  otp,
  purpose
}: {
  email: string;
  expiresAt: number;
  otp: string;
  purpose: string;
}) {
  return createHmac("sha256", process.env.OTP_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "workline-otp")
    .update(`${email}|${purpose}|${otp}|${expiresAt}`)
    .digest("hex");
}

function createVerifiedProof({ email, purpose }: { email: string; purpose: string }) {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const signature = createHmac(
    "sha256",
    process.env.OTP_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "workline-otp"
  )
    .update(`${email}|${purpose}|${expiresAt}`)
    .digest("hex");

  return Buffer.from(JSON.stringify({ email, expiresAt, signature })).toString("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
