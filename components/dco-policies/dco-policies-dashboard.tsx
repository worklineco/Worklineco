"use client";

import { BookOpenCheck, FileText, Laptop, PlaneTakeoff } from "lucide-react";

const policies = [
  {
    icon: PlaneTakeoff,
    title: "Leave Policy",
    tone: "bg-blue-100 text-blue-800",
    points: [
      "Team members should plan leave in advance wherever possible.",
      "Leave requests should mention dates, reason, and backup responsibility.",
      "Urgent leave can be informed to the reporting person as soon as practical."
    ]
  },
  {
    icon: FileText,
    title: "Leave Policy for Articles",
    tone: "bg-emerald-100 text-emerald-800",
    points: [
      "Article leave should be planned with training, client work, and filing timelines in mind.",
      "Exam or study leave should be discussed and recorded before the leave period starts.",
      "Work handover should be completed before long leave."
    ]
  },
  {
    icon: Laptop,
    title: "Laptop Policy",
    tone: "bg-violet-100 text-violet-800",
    points: [
      "Office laptops should be used for professional work and kept secure.",
      "Passwords, client files, and confidential information must not be shared outside authorised access.",
      "Any loss, damage, or technical issue should be reported immediately."
    ]
  }
];

export function DcoPoliciesDashboard() {
  return (
    <section className="mt-5 grid gap-5 lg:grid-cols-3">
      {policies.map((policy) => {
        const Icon = policy.icon;

        return (
          <article
            className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]"
            key={policy.title}
          >
            <div className={`flex size-12 items-center justify-center rounded-2xl ${policy.tone}`}>
              <Icon className="size-6" />
            </div>
            <h2 className="mt-5 text-2xl font-black text-slate-950">{policy.title}</h2>
            <div className="mt-5 space-y-3">
              {policy.points.map((point, index) => (
                <div className="flex gap-3 rounded-2xl bg-slate-50 p-3" key={point}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-slate-500">
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold leading-6 text-slate-600">{point}</p>
                </div>
              ))}
            </div>
          </article>
        );
      })}

      <article className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 p-5 lg:col-span-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-navy-700 text-white">
            <BookOpenCheck className="size-5" />
          </div>
          <div>
            <p className="text-xs font-black uppercase text-slate-500">Policy library</p>
            <h2 className="text-xl font-black text-slate-950">DCo policies saved in one window</h2>
          </div>
        </div>
      </article>
    </section>
  );
}
