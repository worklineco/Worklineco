"use client";

import { TaskHub } from "@/components/task-hub/task-hub";

export default function TaskHubPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <div className="mx-auto w-full max-w-none px-3 py-5 sm:px-5 lg:px-8">
        <header className="mb-4">
          <h1 className="text-3xl font-bold text-navy-700">Task Hub</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Every task by its code — work status, engagement letter, and billing in one place.</p>
        </header>
        <TaskHub />
      </div>
    </main>
  );
}
