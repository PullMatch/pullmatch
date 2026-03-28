import type { ContextBrief } from './index.ts';
import type { ContributorEntry } from './contributor-graph.ts';

/**
 * Group file paths by their top-level directory and summarize areas changed.
 */
function summarizeChanges(filesChanged: string[]): string {
  if (filesChanged.length === 0) return 'No files changed';
  if (filesChanged.length === 1) return `Changes to ${filesChanged[0]}`;

  const dirCounts = new Map<string, number>();
  for (const file of filesChanged) {
    const idx = file.indexOf('/');
    const dir = idx > 0 ? file.slice(0, idx) : '.';
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  }

  // Sort by count descending, take top 3
  const topDirs = Array.from(dirCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dir]) => dir);

  const areas = topDirs.join(', ');
  const suffix = dirCounts.size > 3 ? ` and ${dirCounts.size - 3} more area(s)` : '';
  return `Changes to ${areas}${suffix}`;
}

/**
 * Find the files/directories where a reviewer has expertise that overlap with the PR.
 */
function findFocusAreas(
  reviewer: string,
  filesChanged: string[],
  graph: Map<string, ContributorEntry>
): string[] {
  const entry = graph.get(reviewer);
  if (!entry) return [];

  const areas: string[] = [];

  // Check exact file matches
  if (entry.exactCommits > 0) {
    // We know the reviewer committed to some of the exact files — list the changed files
    // as focus areas since they have direct commit history there
    for (const file of filesChanged) {
      areas.push(`${file} (direct contributor)`);
    }
  }

  // Check directory-level matches
  if (entry.dirCommits > 0) {
    const dirs = new Set<string>();
    for (const file of filesChanged) {
      const idx = file.lastIndexOf('/');
      if (idx > 0) dirs.add(file.slice(0, idx));
    }
    for (const dir of dirs) {
      areas.push(`${dir}/ (directory contributor)`);
    }
  }

  if (entry.isCodeOwner) {
    areas.push(`Code owner for ${entry.codeOwnerFiles ?? 0} file(s)`);
  }

  return areas;
}

/**
 * Generate a context brief for a reviewer on a given PR.
 * Provides a summary of what changed and which areas are relevant to the reviewer.
 */
export function generateContextBrief(
  pr: { title: string; branch: string; filesChanged: string[] },
  reviewer: string,
  graph: Map<string, ContributorEntry>
): ContextBrief {
  return {
    prId: pr.branch,
    reviewer,
    summary: summarizeChanges(pr.filesChanged),
    focusAreas: findFocusAreas(reviewer, pr.filesChanged, graph),
  };
}
