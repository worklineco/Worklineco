import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
type SupabaseAdminClient = ReturnType<typeof createClient<any, "public", any>>;

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Password reset is not configured. Please contact the administrator." },
      { status: 500 }
    );
  }

  if (!email || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Email and a password of at least 6 characters are required." },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cookieStore = await cookies();
  const verifiedProof = cookieStore.get("wl_password-reset_verified")?.value;

  if (!verifiedProof || !isVerifiedResetProof(verifiedProof, normalizedEmail)) {
    cookieStore.delete("wl_password-reset_verified");
    return NextResponse.json({ error: "Please verify the password-reset OTP first." }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const user = await findUserByEmail(supabaseAdmin, normalizedEmail);

  if (!user) {
    cookieStore.delete("wl_password-reset_verified");
    return NextResponse.json(
      { error: "Could not reset this account. Please request a new OTP or contact the administrator." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  cookieStore.delete("wl_password-reset_verified");
  return NextResponse.json({ ok: true });
}

function isVerifiedResetProof(value: string, email: string) {
  try {
    const proof = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      email: string;
      expiresAt: number;
      signature: string;
    };

    if (proof.email !== email || proof.expiresAt < Date.now()) {
      return false;
    }

    const expectedSignature = createHmac(
      "sha256",
      process.env.OTP_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "workline-otp"
    )
      .update(`${proof.email}|password-reset|${proof.expiresAt}`)
      .digest("hex");

    return safeEqual(proof.signature, expectedSignature);
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function findUserByEmail(
  supabaseAdmin: SupabaseAdminClient,
  email: string
) {
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000
    });

    if (error) {
      return null;
    }

    const user = data.users.find((item) => item.email?.toLowerCase() === email);

    if (user) {
      return user;
    }

    if (data.users.length < 1000) {
      return null;
    }

    page += 1;
  }

  return null;
}
