/**
 * Shared pendency rules for the partner Pendency Report and for the TaskLine
 * deep link that opens the matching rows.
 *
 * A matter counts as PENDING when its Stage does not read as submitted and the
 * row is not marked Close in Status Open/Close. Both the dashboard summary and
 * the TaskLine focus filter import these helpers, so the headline count and the
 * drill-down list can never drift apart.
 */

export type PendencyKind = "appeal" | "scn";

export const pendencyKinds: PendencyKind[] = ["scn", "appeal"];

export const pendencyKindLabels: Record<PendencyKind, string> = {
  appeal: "Appeals",
  scn: "Show Cause Notices"
};

export const pendencyKindShortLabels: Record<PendencyKind, string> = {
  appeal: "Appeals",
  scn: "SCNs"
};

export const unassignedTeamLabel = "Unassigned";

/** Matters due within this many days count as "due soon". */
export const dueSoonWindowDays = 7;

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Which pendency bucket a TaskLine "Task" value belongs to, or null when the
 * task is neither a show cause notice nor an appeal. Matched on wording rather
 * than an exact list because the Task master is maintained by the firm.
 */
export function classifyPendencyKind(task: unknown): PendencyKind | null {
  const value = normalize(task);

  if (!value) {
    return null;
  }

  if (value.includes("scn") || value.includes("show cause")) {
    return "scn";
  }

  if (value.includes("appeal")) {
    return "appeal";
  }

  return null;
}

/** Stage wording that means the work has gone out and is no longer pending. */
export function isSubmittedStage(stage: unknown) {
  return normalize(stage).includes("submit");
}

export function isClosedStatus(status: unknown) {
  return normalize(status).startsWith("close");
}

export function isPendingMatter(stage: unknown, status: unknown) {
  return !isSubmittedStage(stage) && !isClosedStatus(status);
}

export function pendencyTeamLabel(team: unknown) {
  return String(team ?? "").trim() || unassignedTeamLabel;
}

/**
 * Turn a TaskLine display date (dd-mm-yyyy) into a sortable yyyy-mm-dd key.
 * Returns "" when the value is blank or unparseable, so callers can treat a
 * missing due date as "no deadline" rather than as overdue.
 */
export function dueDateSortKey(value: unknown) {
  const match = String(value ?? "").trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (!match) {
    return "";
  }

  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

/** Today in Asia/Kolkata as yyyy-mm-dd, for comparing against due dates. */
export function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric"
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** yyyy-mm-dd for the far edge of the "due soon" window. */
export function dueSoonCutoffKey(fromKey = todayKey()) {
  const match = fromKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return fromKey;
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + dueSoonWindowDays));
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export type PendencyDueState = "dueSoon" | "later" | "none" | "overdue";

export function pendencyDueState(dueDate: unknown, today = todayKey(), soonCutoff = dueSoonCutoffKey(today)): PendencyDueState {
  const key = dueDateSortKey(dueDate);

  if (!key) {
    return "none";
  }

  if (key < today) {
    return "overdue";
  }

  if (key <= soonCutoff) {
    return "dueSoon";
  }

  return "later";
}

export type PendencyTeamRow = {
  appeal: number;
  dueSoon: number;
  overdue: number;
  scn: number;
  team: string;
  total: number;
};

export type PendencySummary = {
  asOf: string;
  teams: PendencyTeamRow[];
  totals: Omit<PendencyTeamRow, "team">;
};
