"use client";

import { EngagementLettersRegister } from "@/components/engagement-letters/engagement-letters-register";

export default function EngagementLettersPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <div className="mx-auto w-full max-w-none px-3 py-5 sm:px-5 lg:px-8">
        <header className="mb-4">
          <h1 className="text-3xl font-bold text-navy-700">Engagement Letters</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Track engagement letters, Zoho Drive links, fees, and billing status.</p>
        </header>
        <EngagementLettersRegister />
      </div>
    </main>
  );
}
