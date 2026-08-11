/**
 * Shared TaskLine reminder rules, used by BOTH:
 *  - the daily 09:00 IST cron (app/api/cron/task-due-reminders) and
 *  - the instant due-today reminder sent when a task's due date is set to
 *    today after the daily mail has already gone out (app/api/taskline).
 *
 * Keeping the recipient rules here means the two paths can never drift.
 */

// Fixed subscribers: these addresses receive EVERY due-date reminder for the
// mapped team (keys are normalised team numbers - "3" matches "Team 03",
// "Team-03", etc.). Edit this map to add or remove standing subscribers.
export const extraDueRecipientsByTeam: Record<string, string[]> = {
  "3": ["shuchis.dco@gmail.com"]
};

export function teamMatchKey(value: unknown) {
  const digits = text(value).match(/\d+/);
  if (digits) {
    return String(parseInt(digits[0], 10));
  }
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isManagerRoleText(roleText: string) {
  const normalized = roleText.toLowerCase();
  return (
    normalized.includes("manager") ||
    normalized.includes("partner") ||
    normalized.includes("owner") ||
    normalized.includes("admin")
  );
}

export function parseEmailAddresses(value: unknown) {
  return text(value)
    .split(/[\s,;]+/)
    .map((email) => email.toLowerCase())
    .filter(isEmail);
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function splitNames(value: unknown) {
  return text(value)
    .split(/[,;/\n]+/)
    .map(normalizeName)
    .filter(Boolean);
}

export function normalizeName(value: unknown) {
  const honorifics = new Set(["ca", "cs", "cma", "adv", "advocate", "mr", "mrs", "ms", "dr", "shri", "smt", "sh"]);
  const parts = text(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  while (parts.length > 1 && honorifics.has(parts[0])) {
    parts.shift();
  }

  return parts.join(" ");
}

export function indiaTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric"
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Today's date in TaskLine display format (dd-mm-yyyy), IST. */
export function indiaTodayDisplayDate() {
  const key = indiaTodayKey();
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : key;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

