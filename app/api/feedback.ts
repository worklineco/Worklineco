import { createServerClient, type CookieOptions } from "@supabase/ssr";
import nodemailer from "nodemailer";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();

    if ("error" in auth) {
      return auth.error;
    }

    const formData = await request.formData();
    const message = formData.get("message") as string;
    const file = formData.get("file") as File | null;
    const email =
      auth.user.email ??
      String(auth.user.user_metadata?.email ?? auth.user.user_metadata?.login_email ?? "").trim();
    const sender = email || auth.user.id;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_APP_PASSWORD
      }
    });

    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      attachments.push({
        filename: file.name,
        content: buffer,
        contentType: file.type
      });
    }

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: "somyajainworkline@gmail.com",
      subject: `WorkLine Co - Feedback from ${sender}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); padding: 20px; border-radius: 12px; color: white; margin-bottom: 20px;">
            <h2 style="margin: 0; font-size: 24px;">New Feedback Received</h2>
          </div>

          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
            <p style="margin: 0 0 10px 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">From:</p>
            <p style="margin: 0; color: #0f172a; font-size: 16px; font-weight: bold;">${escapeHtml(sender)}</p>
          </div>

          <div style="background: white; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 15px;">
            <p style="margin: 0 0 10px 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Message:</p>
            <p style="margin: 0; color: #0f172a; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</p>
          </div>

          ${file ? `<div style="background: #f0fdf4; padding: 12px; border-left: 4px solid #22c55e; border-radius: 4px; margin-bottom: 15px;">
            <p style="margin: 0; color: #166534; font-size: 12px;">Image attached: <strong>${escapeHtml(file.name)}</strong></p>
          </div>` : ""}

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">

          <p style="margin: 0; color: #64748b; font-size: 11px; text-align: center;">
            This feedback was submitted via WorkLine Co feedback system
          </p>
        </div>
      `,
      attachments
    });

    return NextResponse.json(
      { success: true, message: "Feedback sent successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Failed to send feedback" },
      { status: 500 }
    );
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function requireUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        }
      }
    }
  );
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }

  return { user };
}
