import { TeamsPanel } from "@/components/home/teams-panel";

export default function TeamsPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa] px-3 py-5 text-slate-950 sm:px-5 lg:px-8">
      <div className="mx-auto w-full max-w-none">
        <TeamsPanel />
      </div>
    </main>
  );
}
