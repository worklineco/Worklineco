import "server-only";

import { createClient } from "@supabase/supabase-js";

const organisationId = "DCO1433";

export type TrustedPartnerApprover = {
  email: string;
  id: string;
  name: string;
};

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Partner approval service is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function toTrustedPartner(user: {
  app_metadata?: Record<string, unknown>;
  email?: string;
  id: string;
  user_metadata?: Record<string, unknown>;
}): TrustedPartnerApprover | null {
  const trustedOrganisation = String(
    user.app_metadata?.workline_organisation ?? ""
  ).trim();
  const trustedRole = String(user.app_metadata?.workline_role ?? "")
    .trim()
    .toLowerCase();
  const email = String(user.email ?? "").trim().toLowerCase();

  if (trustedOrganisation !== organisationId || trustedRole !== "partner" || !email) {
    return null;
  }

  const metadata = user.user_metadata ?? {};
  const name = String(metadata.full_name ?? metadata.name ?? email).trim();

  return {
    email,
    id: user.id,
    name: name || email
  };
}

export async function getTrustedPartnerApprover(id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(id);

  if (error || !data.user) {
    return null;
  }

  return toTrustedPartner(data.user);
}

export async function listTrustedPartnerApprovers() {
  const admin = createAdminClient();
  const partners: TrustedPartnerApprover[] = [];
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000
    });

    if (error) {
      throw new Error(error.message);
    }

    for (const user of data.users) {
      const partner = toTrustedPartner(user);

      if (partner) {
        partners.push(partner);
      }
    }

    if (data.users.length < 1000) {
      break;
    }

    page += 1;
  }

  return partners.sort((first, second) => first.name.localeCompare(second.name));
}
