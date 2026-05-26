import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, randomInt } from "node:crypto";
import { Buffer } from "node:buffer";
import tls from "node:tls";

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

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT ?? 465);
  const fromEmail = process.env.OTP_FROM_EMAIL ?? "";
  const smtpUser = process.env.SMTP_USER ?? extractEmailAddress(fromEmail);
  const smtpAppPassword = process.env.SMTP_APP_PASSWORD;

  if (!smtpHost || !smtpUser || !smtpAppPassword) {
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

  try {
    await sendSmtpMail({
      body: `${description}\n\n${otp}\n\nThis OTP expires in 10 minutes.`,
      from: fromEmail || `WorkLine Co <${smtpUser}>`,
      host: smtpHost,
      password: smtpAppPassword.replace(/\s+/g, ""),
      port: smtpPort,
      subject,
      to: normalizedEmail,
      user: smtpUser
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: formatSmtpError(error),
        details: error instanceof Error ? error.message : "Unknown SMTP error."
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}

function otpCookieName(purpose: string) {
  return `wl_${purpose.replace(/[^a-z0-9-]/gi, "")}_otp`;
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);

  if (match?.[1]) {
    return match[1].trim();
  }

  return value.includes("@") ? value.trim() : undefined;
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

async function sendSmtpMail({
  body,
  from,
  host,
  password,
  port,
  subject,
  to,
  user
}: {
  body: string;
  from: string;
  host: string;
  password: string;
  port: number;
  subject: string;
  to: string;
  user: string;
}) {
  const socket = tls.connect({ host, port, servername: host });
  socket.setEncoding("utf8");

  try {
    await readResponse(socket);
    await command(socket, `EHLO ${host}`);
    await command(socket, "AUTH LOGIN", 334);
    await command(socket, Buffer.from(user).toString("base64"), 334);
    await command(socket, Buffer.from(password).toString("base64"), 235);
    await command(socket, `MAIL FROM:<${user}>`);
    await command(socket, `RCPT TO:<${to}>`);
    await command(socket, "DATA", 354);
    socket.write(
      [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        body,
        "."
      ].join("\r\n") + "\r\n"
    );
    await readResponse(socket);
    await command(socket, "QUIT");
  } finally {
    socket.end();
  }
}

function command(socket: tls.TLSSocket, value: string, expectedCode = 250) {
  const response = readResponse(socket, expectedCode);
  socket.write(`${value}\r\n`);
  return response;
}

function readResponse(socket: tls.TLSSocket, expectedCode?: number) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP request timed out."));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
    }

    function onData(data: string) {
      const lines = data.trimEnd().split(/\r?\n/);
      const lastLine = lines[lines.length - 1] ?? "";

      if (!/^\d{3}\s/.test(lastLine)) {
        return;
      }

      const code = Number(lastLine.slice(0, 3));

      if (expectedCode && code !== expectedCode) {
        cleanup();
        reject(new Error(data.trim()));
        return;
      }

      if (!expectedCode && code >= 400) {
        cleanup();
        reject(new Error(data.trim()));
        return;
      }

      cleanup();
      resolve(data);
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function formatSmtpError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("535") || lowerMessage.includes("authentication failed")) {
    return "Gmail rejected the SMTP login. Please check the Gmail app password and make sure 2-Step Verification is enabled.";
  }

  if (lowerMessage.includes("timed out")) {
    return "Gmail SMTP timed out. Please check SMTP_HOST and SMTP_PORT in Vercel.";
  }

  if (lowerMessage.includes("mail from")) {
    return "Gmail rejected the sender email. Please make sure SMTP_USER and OTP_FROM_EMAIL use the same Gmail account.";
  }

  return "Could not send OTP email. Please check the Gmail SMTP setup.";
}
