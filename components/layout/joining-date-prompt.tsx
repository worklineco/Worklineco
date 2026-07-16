"use client";

import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/supabase/session";

const dismissKey = "wl_joining_prompt_dismissed";

/**
 * Shown once to signed-in users who joined before joining-date was collected.
 * Writes joining_date into the user's own auth metadata.
 */
export function JoiningDatePrompt() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getCurrentUser().then((user) => {
      if (!user) {
        return;
      }

      const existing = String(user.user_metadata?.joining_date ?? "").trim();
      const dismissed = window.sessionStorage.getItem(dismissKey) === "1";

      if (!existing && !dismissed) {
        setOpen(true);
      }
    });
  }, []);

  if (!open) {
    return null;
  }

  async function save() {
    if (!value) {
      setMessage("Please pick your joining date.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ data: { joining_date: value } });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setOpen(false);
  }

  function later() {
    window.sessionStorage.setItem(dismissKey, "1");
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy-900/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex size-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
          <CalendarClock className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">Add your joining date</h2>
        <p className="mt-1 text-sm text-slate-500">
          Help keep team records complete. When did you join the firm?
        </p>
        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase text-slate-500">Joining date</span>
          <input
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-navy-500 focus:ring-4 focus:ring-navy-100"
            onChange={(event) => setValue(event.target.value)}
            type="date"
            value={value}
          />
        </label>
        {message ? <p className="mt-3 text-sm font-medium text-rose-600">{message}</p> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            onClick={later}
            type="button"
          >
            Remind me later
          </button>
          <button
            className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60"
            disabled={saving}
            onClick={save}
            type="button"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
