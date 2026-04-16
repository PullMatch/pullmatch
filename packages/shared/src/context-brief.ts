import type { ExpertiseMap } from './expertise.ts';
import type { ReviewerRecommendation, ContextBrief } from './index.ts';
import { classifyFile } from './expertise.ts';

const DOMAIN_FOCUS: Record<string, string> = {
  Frontend: 'UI behavior, component state, and accessibility.',
  API: 'request/response contracts, auth paths, and error handling.',
  Database: 'schema integrity, query safety, and data migration impact.',
  DevOps: 'deployment safety, runtime configuration, and operational risk.',
  Testing: 'coverage quality for regressions and edge-case behavior.',
  Config: 'default values, environment handling, and compatibility.',
  Docs: 'accuracy of developer guidance and examples.',
};

function topCommitSignal(commitMessages: string[]): 'feat' | 'fix' | 'refactor' | 'mixed' | 'none' {
  if (commitMessages.length === 0) return 'none';

  let feat = 0;
  let fix = 0;
  let refactor = 0;

  for (const message of commitMessages) {
    const match = message.trim().match(/^(feat|fix|refactor)(\(.+\))?:/i);
    const prefix = match?.[1]?.toLowerCase();
    if (prefix === 'feat') feat++;
    if (prefix === 'fix') fix++;
    if (prefix === 'refactor') refactor++;
  }

  const ranked = [
    { key: 'feat' as const, count: feat },
    { key: 'fix' as const, count: fix },
    { key: 'refactor' as const, count: refactor },
  ].sort((a, b) => b.count - a.count);

  if (ranked[0].count === 0) return 'mixed';
  if (ranked[0].count === ranked[1].count) return 'mixed';
  return ranked[0].key;
}

function summarizeCommitIntent(commitMessages: string[]): string {
  const signal = topCommitSignal(commitMessages);
  if (signal === 'feat') return 'Commits are feature-heavy, so validate new behavior and integration paths.';
  if (signal === 'fix') return 'Commits are fix-focused, so prioritize regression and edge-case checks.';
  if (signal === 'refactor') return 'Commits are refactor-focused, so confirm no behavior drift was introduced.';
  if (signal === 'mixed') return 'Commits are mixed; review for both behavior changes and regression risk.';
  return 'No commit messages were provided; prioritize correctness and backward compatibility checks.';
}

function pickReviewerDomain(reviewer: string, expertiseMap?: ExpertiseMap): string | undefined {
  return expertiseMap?.[reviewer]?.[0]?.domain;
}

function filesForDomain(changedFiles: string[], domain?: string): string[] {
  if (!domain) return [];
  return changedFiles.filter((file) => classifyFile(file).includes(domain));
}

function formatFileList(files: string[]): string {
  if (files.length === 0) return 'no specific files';
  if (files.length === 1) return files[0];
  if (files.length === 2) return `${files[0]} and ${files[1]}`;
  return `${files[0]}, ${files[1]}, and ${files.length - 2} more file(s)`;
}

function summarizeChangesForReviewer(
  reviewer: string,
  changedFiles: string[],
  expertiseMap?: ExpertiseMap
): string {
  if (changedFiles.length === 0) return 'No changed files were provided.';
  const domain = pickReviewerDomain(reviewer, expertiseMap);
  const domainFiles = filesForDomain(changedFiles, domain);

  if (domain && domainFiles.length > 0) {
    return `${domainFiles.length} changed file(s) match your ${domain} domain: ${formatFileList(domainFiles)}.`;
  }

  return `Primary touched files: ${formatFileList(changedFiles)}.`;
}

function focusGuidanceForReviewer(reviewer: string, changedFiles: string[], expertiseMap?: ExpertiseMap): string {
  const domain = pickReviewerDomain(reviewer, expertiseMap);
  if (domain && DOMAIN_FOCUS[domain]) {
    return `${domain} focus: ${DOMAIN_FOCUS[domain]}`;
  }

  const touchedDomains = new Set<string>();
  for (const file of changedFiles) {
    for (const touched of classifyFile(file)) {
      touchedDomains.add(touched);
    }
  }
  if (touchedDomains.size > 0) {
    return `Cross-domain review (${Array.from(touchedDomains).slice(0, 2).join(', ')}): verify boundary assumptions and side effects.`;
  }
  return 'General review: check behavior correctness, test coverage, and maintainability.';
}

/**
 * Generate 3-line deterministic markdown context briefs for suggested reviewers.
 */
export function generateContextBrief(
  reviewers: ReviewerRecommendation[],
  changedFiles: string[],
  commitMessages: string[],
  expertiseMap?: ExpertiseMap
): ContextBrief[] {
  return reviewers.map((reviewer) => {
    const whatChanged = summarizeChangesForReviewer(reviewer.login, changedFiles, expertiseMap);
    const whyItMatters = summarizeCommitIntent(commitMessages);
    const whatToLookFor = focusGuidanceForReviewer(reviewer.login, changedFiles, expertiseMap);

    return {
      reviewer: reviewer.login,
      brief: [
        `- **What changed:** ${whatChanged}`,
        `- **Why it matters:** ${whyItMatters}`,
        `- **What to look for:** ${whatToLookFor}`,
      ].join('\n'),
    } satisfies ContextBrief;
  });
}
