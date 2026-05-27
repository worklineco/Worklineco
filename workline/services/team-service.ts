import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TenantService } from "@/services/tenant-service";

export interface TeamMember {
  id: string;
  email: string;
  role: string;
  organizationId: string;
}

export class TeamService {
  async getTeamMembers(): Promise<TeamMember[]> {
    const activeMembership = await new TenantService().getActiveMembership();
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("organization_memberships")
      .select(`
        user_id,
        role,
        users(email, full_name)
      `)
      .eq("organization_id", activeMembership.organizationId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      id: row.user_id,
      email: row.users?.email ?? "N/A",
      name: row.users?.full_name ?? "Team Member",
      role: row.role,
      organizationId: activeMembership.organizationId
    }));
  }
}
