import { fetchRecentCommitters } from './github.ts';

export interface ContributorEntry {
  login: string;
  fileCount: number;
  latestCommit: string; // ISO date of most recent commit across touched files
}

/**
 * For each file in `files`, fetch recent committers from GitHub and aggregate
 * into a map of contributor -> ContributorEntry.
 */
export async function buildContributorGraph(
  owner: string,
  repo: string,
  files: string[],
  token?: string
): Promise<Map<string, ContributorEntry>> {
  const graph = new Map<string, ContributorEntry>();

  await Promise.all(
    files.map(async (filename) => {
      const committers = await fetchRecentCommitters(owner, repo, filename, token);
      for (const { login, date } of committers) {
        const existing = graph.get(login);
        if (!existing) {
          graph.set(login, { login, fileCount: 1, latestCommit: date });
        } else {
          existing.fileCount += 1;
          if (date > existing.latestCommit) {
            existing.latestCommit = date;
          }
        }
      }
    })
  );

  return graph;
}
