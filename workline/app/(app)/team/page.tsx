import { TeamService } from "@/services/team-service";
import { Mail, User, Shield } from "lucide-react";

export default async function TeamPage() {
  const teamService = new TeamService();
  const teamMembers = await teamService.getTeamMembers();

  const formatRole = (role: string) => {
    return role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
        <p className="text-muted-foreground mt-2">
          Manage and view all team members in your organization
        </p>
      </div>

      <div className="grid gap-4">
        {teamMembers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">No team members found</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted">
                  <th className="px-6 py-3 text-left font-semibold">Name</th>
                  <th className="px-6 py-3 text-left font-semibold">Email</th>
                  <th className="px-6 py-3 text-left font-semibold">Designation</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((member) => (
                  <tr key={member.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium">{member.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        {member.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                          {formatRole(member.role)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
