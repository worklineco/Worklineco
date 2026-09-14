type TeamMetadata = {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function list(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(text).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map(text).filter(Boolean);
  }
  return [];
}

export function normalizeTeam(value: unknown) {
  const trimmed = text(value);
  const digits = trimmed.match(/\d+/);
  return digits ? `team ${String(parseInt(digits[0], 10)).padStart(2, "0")}` : trimmed.toLowerCase();
}

export function readUserTeams(user: TeamMetadata | null | undefined) {
  const appTeams = list(user?.app_metadata?.workline_teams);
  const profileTeams = list(user?.user_metadata?.teams);
  const primaryTeam = text(user?.user_metadata?.team);
  const candidates = appTeams.length ? appTeams : [primaryTeam, ...profileTeams];
  const teams: string[] = [];
  const seen = new Set<string>();

  for (const team of candidates) {
    const key = normalizeTeam(team);
    if (key && !seen.has(key)) {
      seen.add(key);
      teams.push(team);
    }
  }

  return teams;
}

export function readPrimaryTeam(user: TeamMetadata | null | undefined) {
  const primaryTeam = text(user?.user_metadata?.team);
  return primaryTeam || readUserTeams(user)[0] || "";
}

export function teamIsAllowed(team: unknown, allowedTeams: string[]) {
  const key = normalizeTeam(team);
  return Boolean(key) && allowedTeams.some((allowedTeam) => normalizeTeam(allowedTeam) === key);
}

export function userHasTeam(user: TeamMetadata | null | undefined, team: unknown) {
  return teamIsAllowed(team, readUserTeams(user));
}
