import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Register edit permissions.
 *
 * Article Assistants have VIEW-ONLY access on TaskLine, GSTAT, and Client
 * Records. Everyone else keeps full rights. An Article Assistant granted the
 * Admin role (trusted app_metadata.workline_admin, managed by Senior Managers
 * and Partners from the Team Members panel) gets the same editing rights as a
 * Manager - except Billing, which stays blocked for every Article Assistant.
 *
 * Access fails closed when trusted role metadata has not been provisioned.
 * Profile/user metadata is intentionally never used for authorization because
 * signed-in users can edit it themselves.
 */
export function isViewOnlyRegisterUser(user: User) {
  const accessMetadata = user.app_metadata ?? {};
  const role = String(accessMetadata.workline_role ?? "").trim().toLowerCase();

  return !role || (role.includes("article") && accessMetadata.workline_admin !== true);
}

export function viewOnlyRegisterResponse(moduleName: string) {
  return NextResponse.json(
    {
      error: `Article Assistants have view-only access on ${moduleName}. Ask a Senior Manager or Partner for the Admin role if you need to edit.`
    },
    { status: 403 }
  );
}
