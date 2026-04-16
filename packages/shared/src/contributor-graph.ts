import { fetchRecentCommitters } from './github.ts';

export interface ContributorEntry {
  login: string;
  exactCommits: number;  // commits to exact changed files
  dirCommits: number;    // commits to directories of changed files
  latestCommit: string;  // ISO date of most recent commit
  isCodeOwner?: boolean;       // true if user is a CODEOWNERS match
  codeOwnerFiles?: number;     // count of changed files they own via CODEOWNERS
}

const BOT_SUFFIXES = ['[bot]', '-bot'];
const BOT_PREFIXES = ['bot-', 'dependabot'];

function isBot(login: string): boolean {
  const lower = login.toLowerCase();
  return (
    BOT_SUFFIXES.some((s) => lower.endsWith(s)) ||
    BOT_PREFIXES.some((p) => lower.startsWith(p))
  );
}

function uniqueDirs(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const idx = f.lastIndexOf('/');
    if (idx > 0) dirs.add(f.slice(0, idx));
  }
  return Array.from(dirs);
}

/**
 * Build a contributor graph from:
 * 1. Exact file commits — higher weight, tracks who committed to the exact changed files
 * 2. Directory-level commits — lower weight, tracks who is active in the same directories
 *
 * Bot accounts are excluded.
 */
export async function buildContributorGraph(
  owner: string,
  repo: string,
  files: string[],
  token?: string
): Promise<Map<string, ContributorEntry>> {
  const graph = new Map<string, ContributorEntry>();

  function upsert(login: string, date: string, isExact: boolean): void {
    if (isBot(login)) return;
    const existing = graph.get(login);
    if (!existing) {
      graph.set(login, {
        login,
        exactCommits: isExact ? 1 : 0,
        dirCommits: isExact ? 0 : 1,
        latestCommit: date,
      });
    } else {
      if (isExact) {
        existing.exactCommits += 1;
      } else {
        existing.dirCommits += 1;
      }
      if (date > existing.latestCommit) {
        existing.latestCommit = date;
      }
    }
  }

  // Phase 1: exact file commits
  await Promise.all(
    files.map(async (filename) => {
      try {
        const committers = await fetchRecentCommitters(owner, repo, filename, token);
        for (const { login, date } of committers) {
          upsert(login, date, true);
        }
      } catch (err) {
        console.warn(`[graph] Failed to fetch committers for file ${filename}: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );

  // Phase 2: directory-level commits for unique parent directories
  const dirs = uniqueDirs(files);
  await Promise.all(
    dirs.map(async (dir) => {
      try {
        const committers = await fetchRecentCommitters(owner, repo, dir, token);
        for (const { login, date } of committers) {
          upsert(login, date, false);
        }
      } catch (err) {
        console.warn(`[graph] Failed to fetch committers for directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );

  return graph;
}
