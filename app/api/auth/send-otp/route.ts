import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, randomInt } from "node:crypto";

const otpTtlMs = 10 * 60 * 1000;

export async function POST(request: Request) {
  const { email, label, purpose } = (await request.json()) as {
    email?: string;
    label?: string;
    purpose?: string;
  };

  if (!email || !purpose) {
    return NextResponse.json({ error: "Email and purpose are required." }, { status: 400 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    return NextResponse.json(
      { error: "OTP email is not available right now. Please contact the administrator." },
      { status: 500 }
    );
  }

  const otp = randomInt(100000, 1000000).toString();
  const expiresAt = Date.now() + otpTtlMs;
  const normalizedEmail = email.trim().toLowerCase();
  const cookieName = otpCookieName(purpose);
  const hash = signOtp({ email: normalizedEmail, expiresAt, otp, purpose });
  const cookieStore = await cookies();

  cookieStore.set(
    cookieName,
    Buffer.from(JSON.stringify({ email: normalizedEmail, expiresAt, hash })).toString("base64url"),
    {
      httpOnly: true,
      maxAge: Math.floor(otpTtlMs / 1000),
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  );

  const subject = purpose === "team" ? "WorkLine team approval OTP" : "WorkLine signup OTP";
  const description =
    purpose === "team"
      ? `Approval OTP for ${label ?? "this team"}`
      : "Email verification OTP for your WorkLine signup";

  const emailResult = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: process.env.OTP_FROM_EMAIL ?? "WorkLine Co <onboarding@worklineco.com>",
      html: `<p>${description}</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>This OTP expires in 10 minutes.</p>`,
      subject,
      text: `${description}\n\n${otp}\n\nThis OTP expires in 10 minutes.`,
      to: [normalizedEmail]
    }),
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!emailResult.ok) {
    const details = await emailResult.text();
    return NextResponse.json({ error: formatEmailError(details), details }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

function formatEmailError(details: string) {
  if (details.toLowerCase().includes("resend.dev")) {
    return "OTP email could not be sent because the sender domain is still in test mode. Please verify worklineco.com in Resend.";
  }

  if (details.toLowerCase().includes("domain") || details.toLowerCase().includes("from")) {
    return "OTP email could not be sent because the sender email domain is not verified in Resend.";
  }

  return "Could not send OTP email. Please check the email sender setup.";
}

function otpCookieName(purpose: string) {
  return `wl_${purpose.replace(/[^a-z0-9-]/gi, "")}_otp`;
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
