const GITHUB_API = 'https://api.github.com';

export interface TeamMember {
  login: string;
  teamSlug: string;
}

export interface TeamResolutionResult {
  /** Map from login to list of team slugs they belong to */
  memberTeams: Map<string, string[]>;
  /** Team entries from CODEOWNERS that matched changed files, mapped to team slug */
  teamFileOwnership: Map<string, number>;
  /** Logins that are members of teams owning changed files */
  teamOwnerLogins: Set<string>;
}

/**
 * Fetch members of a GitHub team via the Teams API.
 * Requires org:read scope. Returns empty array on error (graceful degradation).
 */
export async function getTeamMembers(
  org: string,
  teamSlug: string,
  token: string
): Promise<TeamMember[]> {
  const url = `${GITHUB_API}/orgs/${org}/teams/${teamSlug}/members?per_page=100`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      console.debug(`[teams] Failed to fetch team ${org}/${teamSlug}: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as Array<{ login: string }>;
    return data.map((m) => ({ login: m.login, teamSlug }));
  } catch (err) {
    console.debug(`[teams] Error fetching team ${org}/${teamSlug}:`, err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Parse CODEOWNERS content and extract team entries (e.g. @org/frontend-team).
 * Returns array of { pattern, org, teamSlug } for each team-based rule.
 */
export function parseCodeownersTeams(
  codeownersContent: string
): Array<{ pattern: string; org: string; teamSlug: string }> {
  const results: Array<{ pattern: string; org: string; teamSlug: string }> = [];
  for (const line of codeownersContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const pattern = parts[0];

    for (let i = 1; i < parts.length; i++) {
      const owner = parts[i];
      // Match @org/team-slug pattern
      const match = owner.match(/^@([^/]+)\/(.+)$/);
      if (match) {
        results.push({ pattern, org: match[1], teamSlug: match[2] });
      }
    }
  }
  return results;
}

/**
 * Check if a file matches a CODEOWNERS pattern.
 * Supports basic glob patterns used in CODEOWNERS files.
 */
export function matchesCodeownersPattern(file: string, pattern: string): boolean {
  // Exact match
  if (file === pattern) return true;

  // Directory match: pattern like /docs/ or docs/ matches all files under it
  if (pattern.endsWith('/')) {
    const dir = pattern.startsWith('/') ? pattern.slice(1) : pattern;
    return file.startsWith(dir);
  }

  // Leading slash means root-relative
  const normalizedPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern;

  // Simple wildcard: *.ext matches files with that extension anywhere
  if (normalizedPattern.startsWith('*.')) {
    const ext = normalizedPattern.slice(1); // includes the dot
    return file.endsWith(ext);
  }

  // Directory prefix without trailing slash (e.g. /src/components)
  if (file.startsWith(normalizedPattern + '/') || file === normalizedPattern) {
    return true;
  }

  // ** glob: matches any path
  if (normalizedPattern.includes('**')) {
    const regex = new RegExp(
      '^' + normalizedPattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/(?<!\.)(\*)/g, '[^/]*') + '$'
    );
    return regex.test(file);
  }

  // Single * glob at end
  if (normalizedPattern.includes('*')) {
    const regex = new RegExp(
      '^' + normalizedPattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '[^/]*') + '$'
    );
    return regex.test(file);
  }

  return false;
}

/**
 * Resolve team ownership for a set of changed files.
 *
 * 1. Parses CODEOWNERS for team entries
 * 2. Matches changed files against team patterns
 * 3. Fetches team members for matching teams
 * 4. Returns which logins are team owners of changed files
 *
 * Gracefully degrades: if team API calls fail, those teams are skipped.
 */
export async function resolveTeamOwnership(
  org: string,
  codeownersContent: string,
  changedFiles: string[],
  token: string
): Promise<TeamResolutionResult> {
  const teamEntries = parseCodeownersTeams(codeownersContent);
  const teamFileOwnership = new Map<string, number>();

  // Find which teams own which changed files
  for (const entry of teamEntries) {
    let matchCount = 0;
    for (const file of changedFiles) {
      if (matchesCodeownersPattern(file, entry.pattern)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      const key = `${entry.org}/${entry.teamSlug}`;
      teamFileOwnership.set(key, (teamFileOwnership.get(key) ?? 0) + matchCount);
    }
  }

  if (teamFileOwnership.size === 0) {
    return { memberTeams: new Map(), teamFileOwnership, teamOwnerLogins: new Set() };
  }

  // Fetch members for matching teams (deduplicate by team slug)
  const teamsToFetch = new Map<string, string>(); // key -> org
  for (const key of teamFileOwnership.keys()) {
    const [orgName, slug] = key.split('/');
    teamsToFetch.set(slug, orgName);
  }

  const memberTeams = new Map<string, string[]>();
  const teamOwnerLogins = new Set<string>();

  await Promise.all(
    Array.from(teamsToFetch.entries()).map(async ([slug, orgName]) => {
      const members = await getTeamMembers(orgName, slug, token);
      for (const member of members) {
        teamOwnerLogins.add(member.login);
        const existing = memberTeams.get(member.login);
        if (existing) {
          existing.push(slug);
        } else {
          memberTeams.set(member.login, [slug]);
        }
      }
    })
  );

  return { memberTeams, teamFileOwnership, teamOwnerLogins };
}

/**
 * Fetch CODEOWNERS content from a GitHub repo.
 * Checks the standard locations: .github/CODEOWNERS, CODEOWNERS, docs/CODEOWNERS.
 */
export async function fetchCodeowners(
  owner: string,
  repo: string,
  token: string
): Promise<string | null> {
  const paths = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
  for (const path of paths) {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3.raw',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        return await res.text();
      }
    } catch {
      // try next path
    }
  }
  return null;
}

/**
 * Parse CODEOWNERS content and extract individual user entries (e.g. @username).
 * Returns array of { pattern, login } for each individual user rule.
 */
export function parseCodeownersIndividuals(
  codeownersContent: string
): Array<{ pattern: string; login: string }> {
  const results: Array<{ pattern: string; login: string }> = [];
  for (const line of codeownersContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const pattern = parts[0];

    for (let i = 1; i < parts.length; i++) {
      const owner = parts[i];
      // Match @username (not @org/team)
      const match = owner.match(/^@([^/]+)$/);
      if (match) {
        results.push({ pattern, login: match[1] });
      }
    }
  }
  return results;
}

/**
 * Annotate a contributor graph with CODEOWNERS data.
 * Sets isCodeOwner and codeOwnerFiles on entries whose login matches
 * an individual CODEOWNERS rule for any of the changed files.
 */
export function annotateCodeowners(
  graph: Map<string, import('./contributor-graph.ts').ContributorEntry>,
  codeownersContent: string,
  changedFiles: string[]
): void {
  const individuals = parseCodeownersIndividuals(codeownersContent);
  if (individuals.length === 0) return;

  // Build a map of login -> count of owned changed files
  const ownershipCount = new Map<string, number>();

  for (const { pattern, login } of individuals) {
    for (const file of changedFiles) {
      if (matchesCodeownersPattern(file, pattern)) {
        ownershipCount.set(login, (ownershipCount.get(login) ?? 0) + 1);
      }
    }
  }

  // Annotate graph entries
  for (const [login, fileCount] of ownershipCount) {
    const entry = graph.get(login);
    if (entry) {
      entry.isCodeOwner = true;
      entry.codeOwnerFiles = fileCount;
    }
  }
}
