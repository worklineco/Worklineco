import { supabase } from "@/lib/supabase/client";

/**
 * Returns the currently signed-in user from the LOCAL session (cookie/storage).
 *
 * Unlike `supabase.auth.getUser()`, this does NOT make a network round trip to
 * the auth server. The user is already validated server-side by middleware on
 * every request, so the client only needs the local session for id/email/
 * user_metadata. This removes one network round trip from every page load.
 */
export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

// Module-level cache. In a single-page app the JS context survives client-side
// navigation, so the organisation_id is fetched once per session instead of on
// every page mount.
let cachedOrgId: string | null = null;
let cachedForUserId: string | null = null;

/**
 * Returns the current user's organisation_id, caching it for the session so the
 * `users` lookup only hits the database once instead of on every page.
 */
export async function getOrganisationId(): Promise<string | null> {
  const user = await getCurrentUser();

  if (!user) {
    clearWorkspaceCache();
    return null;
  }

  if (cachedOrgId && cachedForUserId === user.id) {
    return cachedOrgId;
  }

  const { data, error } = await supabase
    .from("users")
    .select("organisation_id")
    .eq("id", user.id)
    .single();

  if (error || !data?.organisation_id) {
    return null;
  }

  cachedOrgId = data.organisation_id as string;
  cachedForUserId = user.id;
  return cachedOrgId;
}

/** Clear cached workspace data — call on sign-out. */
export function clearWorkspaceCache() {
  cachedOrgId = null;
  cachedForUserId = null;
}
