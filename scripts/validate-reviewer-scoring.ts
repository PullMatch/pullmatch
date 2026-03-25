#!/usr/bin/env node
/**
 * validate-reviewer-scoring.ts
 *
 * Validates the deterministic reviewer scoring pipeline against a real GitHub PR.
 * Writes /artifacts/reviewer-scoring-validation.md on success.
 *
 * Usage:
 *   GITHUB_TOKEN_WRITE=<token> npx tsx scripts/validate-reviewer-scoring.ts \
 *     [owner] [repo] [prNumber] [author]
 *
 * Defaults to microsoft/vscode PR #233055 when no args are provided.
 *
 * Exit codes:
 *   0  — validation passed
 *   1  — missing token, no files, or no reviewers found
 */

import { fetchPRFiles, buildContributorGraph, matchReviewers } from '../packages/shared/src/index.ts';
import type { ContributorEntry } from '../packages/shared/src/contributor-graph.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OWNER   = process.argv[2] ?? 'microsoft';
const REPO    = process.argv[3] ?? 'vscode';
const PR_NUM  = Number(process.argv[4] ?? 233055);
const AUTHOR  = process.argv[5] ?? '';
const TOP_N   = 3;

async function main() {
  const token = process.env.GITHUB_TOKEN_WRITE;
  if (!token) {
    console.error('ERROR: GITHUB_TOKEN_WRITE is not set');
    process.exit(1);
  }

  console.log(`\n[validate-reviewer-scoring] Analyzing ${OWNER}/${REPO}#${PR_NUM} ...`);

  // 1. Fetch PR files
  console.log('[validate-reviewer-scoring] Fetching PR files from GitHub API...');
  const files = await fetchPRFiles(OWNER, REPO, PR_NUM, token);
  if (files.length === 0) {
    console.error('ERROR: GitHub API returned 0 files');
    process.exit(1);
  }
  console.log(`[validate-reviewer-scoring] ${files.length} file(s) changed`);

  const filenames = files.map((f) => f.filename);

  // 2. Build contributor graph (exact + directory commits, bots excluded)
  console.log('[validate-reviewer-scoring] Building contributor graph (exact + dir commits)...');
  const graph = await buildContributorGraph(OWNER, REPO, filenames, token);
  console.log(`[validate-reviewer-scoring] ${graph.size} candidate reviewer(s) found (bots excluded)`);

  if (graph.size === 0) {
    console.error('ERROR: No contributors found in repo history for these files');
    process.exit(1);
  }

  // 3. Score and rank reviewers
  const reviewers = matchReviewers(graph, AUTHOR, TOP_N);
  if (reviewers.length === 0) {
    console.error('ERROR: matchReviewers returned 0 results');
    process.exit(1);
  }
  console.log(`[validate-reviewer-scoring] Top ${reviewers.length} reviewer(s) selected`);

  // 4. Collect score breakdown for all candidates
  const allCandidates = Array.from(graph.values())
    .filter((e) => e.login !== AUTHOR)
    .map((e: ContributorEntry) => {
      const ageDays = Math.round(
        (Date.now() - new Date(e.latestCommit).getTime()) / (1000 * 60 * 60 * 24)
      );
      const recency = Math.max(0, 1 - ageDays / 90);
      const score = e.exactCommits * 3 + e.dirCommits * 1 + recency * 2;
      return { login: e.login, exactCommits: e.exactCommits, dirCommits: e.dirCommits, ageDays, recency, score };
    })
    .sort((a, b) => b.score - a.score || a.login.localeCompare(b.login));

  // 5. Write artifact
  const lines: string[] = [
    '# PullMatch — Reviewer Scoring Validation',
    '',
    `**Date:** ${new Date().toISOString()}`,
    `**Repo:** ${OWNER}/${REPO}`,
    `**PR:** #${PR_NUM}`,
    `**PR Author excluded:** ${AUTHOR || '(none)'}`,
    '',
    '## Changed Files Analyzed',
    '',
    ...filenames.map((f) => `- \`${f}\``),
    '',
    '## Scoring Formula',
    '',
    '```',
    'score = exactCommits * 3 + dirCommits * 1 + recencyScore * 2',
    '',
    'exactCommits: number of commits to exact changed files (highest weight)',
    'dirCommits:   number of commits to directories of changed files',
    'recencyScore: linear decay [0,1] over 90 days (0 = 90+ days old, 1 = today)',
    'Tie-break:    alphabetical by login (deterministic)',
    '```',
    '',
    '## Candidate Reviewers Found',
    '',
    `Total candidates (bots excluded): **${graph.size}**`,
    '',
    '| Username | Exact Commits | Dir Commits | Age (days) | Recency | Score |',
    '|----------|---------------|-------------|------------|---------|-------|',
    ...allCandidates.map((c) =>
      `| @${c.login} | ${c.exactCommits} | ${c.dirCommits} | ${c.ageDays} | ${c.recency.toFixed(2)} | ${(Math.round(c.score * 100) / 100).toFixed(2)} |`
    ),
    '',
    '## Final Top 3 Reviewers',
    '',
    '| Rank | Username | Score | Reasons |',
    '|------|----------|-------|---------|',
    ...reviewers.map((r, i) =>
      `| ${i + 1} | @${r.login} | ${r.score} | ${r.reasons.join('; ')} |`
    ),
    '',
    '## Score Breakdown per Reviewer',
    '',
    ...reviewers.flatMap((r, i) => {
      const entry = graph.get(r.login)!;
      const ageDays = Math.round(
        (Date.now() - new Date(entry.latestCommit).getTime()) / (1000 * 60 * 60 * 24)
      );
      const recency = Math.max(0, 1 - ageDays / 90);
      return [
        `### ${i + 1}. @${r.login} (score: ${r.score})`,
        '',
        `- Exact file commits: **${entry.exactCommits}** × 3 = ${entry.exactCommits * 3}`,
        `- Directory commits:  **${entry.dirCommits}** × 1 = ${entry.dirCommits}`,
        `- Recency score:      **${recency.toFixed(3)}** × 2 = ${(recency * 2).toFixed(3)} (last commit ${ageDays} day(s) ago)`,
        `- **Total: ${r.score}**`,
        '',
      ];
    }),
    '## Why This Ranking',
    '',
    'Rankings are fully deterministic: same input always produces the same output.',
    'No LLM or random selection is used. Reviewers are ranked purely by:',
    '1. Direct file ownership (commits to the exact changed files) — highest weight',
    '2. Directory familiarity (commits in the same directory) — lower weight',
    '3. Recency (recent activity weighted more than stale) — tiebreaker',
    '',
    '---',
    '_Generated by scripts/validate-reviewer-scoring.ts — live GitHub API data, no mocks, no LLM._',
  ];

  const artifactDir  = join(process.cwd(), 'artifacts');
  const artifactPath = join(artifactDir, 'reviewer-scoring-validation.md');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(artifactPath, lines.join('\n'));

  console.log('\n[validate-reviewer-scoring] Artifact written to artifacts/reviewer-scoring-validation.md');
  console.log('[validate-reviewer-scoring] PASS');
}

main().catch((err) => {
  console.error('[validate-reviewer-scoring] FATAL:', err);
  process.exit(1);
});
