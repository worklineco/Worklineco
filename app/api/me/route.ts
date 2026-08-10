import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; options: CookieOptions; value: string };

/**
 * Lightweight profile endpoint for client-side permission gating.
 * Reads only the signed-in user's own metadata - no admin client, no
 * user listing - so it responds fast enough to call on every page load.
 */
export async function GET() {
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
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const profileMetadata = user.user_metadata ?? {};
  const accessMetadata = user.app_metadata ?? {};
  const trustedRole = String(accessMetadata.workline_role ?? "").trim();
  const isArticle = trustedRole.toLowerCase().includes("article");
  const isWorklineAdmin = accessMetadata.workline_admin === true;
  const hasTrustedRole = trustedRole.length > 0;

  return NextResponse.json({
    canEditRegisters: hasTrustedRole && (!isArticle || isWorklineAdmin),
    isArticle,
    isWorklineAdmin,
    name: String(profileMetadata.full_name ?? profileMetadata.name ?? "").trim(),
    role: trustedRole || String(profileMetadata.role ?? profileMetadata.designation ?? "").trim(),
    team: String(profileMetadata.team ?? "").trim()
  });
}
