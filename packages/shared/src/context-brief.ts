import type { ReviewerRecommendation } from './index.ts';
import type { ContributorEntry } from './contributor-graph.ts';
import type { PRFile } from './github.ts';

export interface ContextBriefInput {
  prId: string;
  prTitle?: string;
  files: PRFile[];
  commitMessages: string[];
  recommendations: ReviewerRecommendation[];
  contributorGraph: Map<string, ContributorEntry>;
}

export interface ReviewerContextSection {
  login: string;
  score: number;
  whyPicked: string[];
  focusAreas: string[];
}

export interface PRContextBriefResult {
  prId: string;
  summary: string;
  reviewerSections: ReviewerContextSection[];
  markdown: string;
}

const PRIORITY_STATUSES = ['modified', 'added', 'removed', 'renamed'];

function firstLine(text: string): string {
  return text.split('\n')[0]?.trim() ?? '';
}

function toDirectory(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx > 0 ? path.slice(0, idx) : '(root)';
}

function pickTopDirectories(files: PRFile[], max = 3): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const directory = toDirectory(file.filename);
    counts.set(directory, (counts.get(directory) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([directory]) => directory);
}

function formatStatusBreakdown(files: PRFile[]): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    const status = file.status || 'unknown';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  const orderedStatuses = [
    ...PRIORITY_STATUSES.filter((status) => counts.has(status)),
    ...Array.from(counts.keys())
      .filter((status) => !PRIORITY_STATUSES.includes(status))
      .sort((a, b) => a.localeCompare(b)),
  ];

  return orderedStatuses.map((status) => `${counts.get(status)} ${status}`).join(', ');
}

function summarizeCommits(commitMessages: string[], max = 3): string[] {
  const uniqueHeadlines = new Set<string>();
  for (const message of commitMessages) {
    const headline = firstLine(message);
    if (!headline) continue;
    uniqueHeadlines.add(headline);
    if (uniqueHeadlines.size >= max) break;
  }
  return Array.from(uniqueHeadlines);
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildWhyPicked(
  recommendation: ReviewerRecommendation,
  contributor: ContributorEntry | undefined
): string[] {
  if (!contributor) {
    return [
      'Recommended by ranking signals, but no direct file history was found in the current contributor graph.',
      ...recommendation.reasons,
    ];
  }

  const reasons: string[] = [];
  if (contributor.exactCommits > 0) {
    reasons.push(`Has ${contributor.exactCommits} commit(s) on exact changed files in this PR.`);
  }
  if (contributor.dirCommits > 0) {
    reasons.push(`Has ${contributor.dirCommits} commit(s) in the touched directories.`);
  }
  reasons.push(`Most recent contribution on related code: ${contributor.latestCommit}.`);

  return reasons;
}

function buildFocusAreas(
  contributor: ContributorEntry | undefined,
  files: PRFile[],
  topDirectories: string[],
  commitHeadlines: string[]
): string[] {
  const focusAreas: string[] = [];
  const topFiles = files.slice(0, 3).map((file) => file.filename);

  if (contributor?.exactCommits) {
    focusAreas.push(`Validate behavior changes in ${joinWithAnd(topFiles.map((file) => `\`${file}\``))}.`);
  }

  if (contributor?.dirCommits) {
    focusAreas.push(`Check integration boundaries across ${joinWithAnd(topDirectories.map((directory) => `\`${directory}\``))}.`);
  }

  if (commitHeadlines.length > 0) {
    focusAreas.push(`Confirm implementation matches commit intent: "${commitHeadlines[0]}".`);
  }

  if (!contributor) {
    focusAreas.push('Provide a fresh pass on edge cases, regressions, and test coverage.');
  }

  return focusAreas;
}

export function generatePRContextBrief(input: ContextBriefInput): PRContextBriefResult {
  const topDirectories = pickTopDirectories(input.files);
  const commitHeadlines = summarizeCommits(input.commitMessages);
  const statusBreakdown = formatStatusBreakdown(input.files);

  const summary = `${input.files.length} file(s) changed (${statusBreakdown}). Primary areas: ${joinWithAnd(topDirectories.map((directory) => `\`${directory}\``))}.`;

  const reviewerSections = input.recommendations.map((recommendation) => {
    const contributor = input.contributorGraph.get(recommendation.login);
    return {
      login: recommendation.login,
      score: recommendation.score,
      whyPicked: buildWhyPicked(recommendation, contributor),
      focusAreas: buildFocusAreas(contributor, input.files, topDirectories, commitHeadlines),
    } satisfies ReviewerContextSection;
  });

  const lines: string[] = [
    '## PullMatch PR Context Brief',
    '',
    `PR: ${input.prTitle ? `${input.prTitle} (${input.prId})` : input.prId}`,
    '',
    '### Change Summary',
    `- ${summary}`,
  ];

  if (commitHeadlines.length > 0) {
    lines.push('- Commit intent highlights:');
    for (const headline of commitHeadlines) {
      lines.push(`  - ${headline}`);
    }
  }

  lines.push('', '### Reviewer Focus', '');

  for (const section of reviewerSections) {
    lines.push(`#### @${section.login} (score: ${section.score})`);
    lines.push('Why this reviewer:');
    for (const reason of section.whyPicked) {
      lines.push(`- ${reason}`);
    }
    lines.push('Focus areas:');
    for (const area of section.focusAreas) {
      lines.push(`- ${area}`);
    }
    lines.push('');
  }

  return {
    prId: input.prId,
    summary,
    reviewerSections,
    markdown: lines.join('\n').trimEnd(),
  };
}
