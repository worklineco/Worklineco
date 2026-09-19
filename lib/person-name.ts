/**
 * Person-name matching shared by the TaskLine register and the server-side
 * dashboard summaries.
 *
 * The Name column is typed by hand, so the same person appears as "Shuchi
 * Sethi", "CA Shuchi Sethi" and "CA. Shuchi Sethi". Anything that groups or
 * matches on a name must reduce it to the same key first, or one person shows
 * up as several and a drill-down link finds nothing.
 */

const personNameHonorifics = new Set(["ca", "cs", "cma", "adv", "advocate", "mr", "mrs", "ms", "dr", "shri", "smt", "sh"]);

/**
 * Normalise a person's name for matching: lowercase, drop punctuation and any
 * leading honorific (CA / Adv / Mr ...). So "Shuchi Sethi" and "CA Shuchi
 * Sethi" resolve to the same key. A cell naming two people keeps both, so a
 * joint assignment stays its own key rather than collapsing into either name.
 */
export function normalizePersonName(value: unknown) {
  const parts = String(value ?? "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  while (parts.length > 1 && personNameHonorifics.has(parts[0])) {
    parts.shift();
  }

  return parts.join(" ");
}

/** Whether two Name cells refer to the same person however each was typed. */
export function isSamePersonName(first: unknown, second: unknown) {
  const key = normalizePersonName(first);
  return Boolean(key) && key === normalizePersonName(second);
}
