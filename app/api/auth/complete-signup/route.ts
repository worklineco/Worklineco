import { getTrustedPartnerApprover } from "@/lib/auth/trusted-partners";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
type SupabaseAdminClient = ReturnType<typeof createClient<any, "public", any>>;

export async function POST(request: Request) {
  const { approverId, email, metadata, password, teamEmail } = (await request.json()) as {
    approverId?: string;
    email?: string;
    metadata?: Record<string, string>;
    password?: string;
    teamEmail?: string;
  };

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Signup service is not configured yet. Add SUPABASE_SERVICE_ROLE_KEY in Vercel." },
      { status: 500 }
    );
  }

  if (!email || !password || password.length < 6 || !metadata) {
    return NextResponse.json({ error: "Email, password, and signup details are required." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cookieStore = await cookies();
  const emailVerified = cookieStore.get("wl_signup-email_verified")?.value;
  const teamVerified = cookieStore.get("wl_team_verified")?.value;

  if (emailVerified !== normalizedEmail) {
    return NextResponse.json({ error: "Please verify the email OTP first." }, { status: 400 });
  }

  const signupMetadata: Record<string, string> = { ...metadata };
  const signupRole = String(signupMetadata.role ?? "").trim().toLowerCase();
  let requiredApprovalEmail = teamEmail?.trim().toLowerCase() ?? "";

  if (signupRole === "others") {
    if (!approverId) {
      return NextResponse.json(
        { error: "Please select a partner and verify the partner approval OTP first." },
        { status: 400 }
      );
    }

    try {
      const approver = await getTrustedPartnerApprover(approverId);

      if (!approver) {
        return NextResponse.json(
          { error: "The selected partner is not an approved WorkLine partner." },
          { status: 400 }
        );
      }

      requiredApprovalEmail = approver.email;
      signupMetadata.approving_partner = approver.name;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Partner approval service is not available."
        },
        { status: 500 }
      );
    }
  }

  if (requiredApprovalEmail && teamVerified !== requiredApprovalEmail) {
    return NextResponse.json({ error: "Please verify the approval OTP first." }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    password,
    user_metadata: signupMetadata
  });

  if (error) {
    if (!error.message.toLowerCase().includes("already been registered")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const existingUser = await findUserByEmail(supabaseAdmin, normalizedEmail);

    if (!existingUser) {
      return NextResponse.json({ error: "This email is already registered. Please sign in." }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
      password,
      user_metadata: signupMetadata
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  cookieStore.delete("wl_signup-email_verified");
  cookieStore.delete("wl_team_verified");

  return NextResponse.json({ ok: true });
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
