#!/usr/bin/env node
/**
 * validate-match.ts
 *
 * Runs the full reviewer-matching pipeline against a real GitHub PR and writes
 * /artifacts/match-validation.md and /artifacts/match-validation.json.
 *
 * Fails with a non-zero exit code if:
 *   - GITHUB_TOKEN_WRITE is missing
 *   - The GitHub API returns no files
 *   - Fewer than 1 reviewer is returned
 *   - Reviewers appear to be hardcoded/mocked
 *   - PR author appears in the matched reviewers
 *
 * Usage:
 *   GITHUB_TOKEN_WRITE=<token> node --experimental-strip-types scripts/validate-match.ts \
 *     [owner] [repo] [prNumber] [author]
 *
 * Or via npm:
 *   npm run validate:match
 *
 * Defaults to microsoft/vscode PR #304772 when no args are provided.
 * When [author] is omitted, fetches the PR author from the GitHub API automatically.
 */

import { fetchPRFiles, buildContributorGraph, matchReviewers } from '../packages/shared/src/index.ts';
import type { ContributorEntry } from '../packages/shared/src/contributor-graph.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OWNER  = process.argv[2] ?? 'microsoft';
const REPO   = process.argv[3] ?? 'vscode';
const PR_NUM = Number(process.argv[4] ?? 304772);
const TOP_N  = 3;

// Known hardcoded values that would indicate mocked data
const HARDCODED_LOGINS = new Set(['alice', 'bob', 'charlie', 'user1', 'user2', 'test-user', 'reviewer1']);

async function fetchPRAuthor(owner: string, repo: string, prNumber: number, token: string): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    console.warn(`[validate-match] WARNING: Could not fetch PR metadata (${res.status}) — author exclusion skipped`);
    return '';
  }
  const data = await res.json() as { user?: { login?: string } };
  return data?.user?.login ?? '';
}

async function main() {
  const token = process.env.GITHUB_TOKEN_WRITE;
  if (!token) {
    console.error('ERROR: GITHUB_TOKEN_WRITE is not set');
    process.exit(1);
  }

  // Resolve author: use CLI arg if given, otherwise fetch from GitHub API
  const authorArg = process.argv[5] ?? '';
  let author: string;
  if (authorArg) {
    author = authorArg;
    console.log(`[validate-match] PR author provided via CLI: @${author}`);
  } else {
    console.log(`[validate-match] Fetching PR author from GitHub API...`);
    author = await fetchPRAuthor(OWNER, REPO, PR_NUM, token);
    if (author) {
      console.log(`[validate-match] PR author resolved: @${author} (will be excluded from results)`);
    } else {
      console.warn(`[validate-match] WARNING: PR author unknown — no author will be excluded`);
    }
  }

  console.log(`\n[validate-match] Analyzing ${OWNER}/${REPO}#${PR_NUM} ...`);

  // 1. Fetch PR files from live GitHub API
  console.log('[validate-match] Fetching PR files from GitHub API...');
  const files = await fetchPRFiles(OWNER, REPO, PR_NUM, token);
  if (files.length === 0) {
    console.error('ERROR: GitHub API returned 0 files — possible mocked or empty response');
    process.exit(1);
  }
  console.log(`[validate-match] ${files.length} file(s) changed`);

  // 2. Build contributor graph from real repo history
  console.log('[validate-match] Building contributor graph from commit history...');
  const filenames = files.map((f) => f.filename);
  const graph = await buildContributorGraph(OWNER, REPO, filenames, token);
  const candidateCount = graph.size;
  console.log(`[validate-match] ${candidateCount} candidate reviewer(s) found`);

  // Count total history records (commits) analyzed
  let totalHistoryRecords = 0;
  for (const entry of graph.values()) {
    totalHistoryRecords += entry.exactCommits + entry.dirCommits;
  }

  // 3. Match reviewers (PR author excluded)
  const reviewers = matchReviewers(graph, author, TOP_N);
  if (reviewers.length === 0) {
    console.error('ERROR: matchReviewers returned 0 results — no reviewers found in commit history');
    process.exit(1);
  }

  // 4. Validate reviewers are not hardcoded/mocked
  for (const r of reviewers) {
    if (HARDCODED_LOGINS.has(r.login.toLowerCase())) {
      console.error(`ERROR: Reviewer "${r.login}" appears to be a hardcoded mock value`);
      process.exit(1);
    }
  }
  console.log(`[validate-match] ${reviewers.length} reviewer(s) matched — no hardcoded values detected`);

  // 5. Validate PR author is not in results
  if (author) {
    const authorInResults = reviewers.some((r) => r.login === author);
    if (authorInResults) {
      console.error(`ERROR: PR author "@${author}" appears in matched reviewers — exclusion failed`);
      process.exit(1);
    }
    console.log(`[validate-match] PR author @${author} correctly excluded from results`);
  }

  // 6. Fetch raw API sample for traceability
  const GITHUB_API = 'https://api.github.com';
  const sampleFile = filenames[0];
  const sampleUrl = `${GITHUB_API}/repos/${OWNER}/${REPO}/commits?path=${encodeURIComponent(sampleFile)}&per_page=5`;
  console.log(`[validate-match] Fetching raw API sample for: ${sampleFile}`);
  const sampleRes = await fetch(sampleUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  const sampleData: unknown[] = sampleRes.ok ? await sampleRes.json() : [];

  const sampleCommits = (sampleData as unknown[]).slice(0, 3).map((c: unknown) => {
    const commit = c as {
      sha: string;
      author?: { login: string } | null;
      commit: { author: { date: string }; message: string };
    };
    return {
      sha: commit.sha?.slice(0, 7),
      author: commit.author?.login ?? null,
      date: commit.commit?.author?.date,
      message: commit.commit?.message?.split('\n')[0]?.slice(0, 80),
    };
  });

  const timestamp = new Date().toISOString();

  // 7. Build structured JSON output
  const jsonOutput = {
    repo: `${OWNER}/${REPO}`,
    prNumber: PR_NUM,
    excludedAuthor: author || null,
    changedFiles: filenames,
    candidates: Array.from(graph.values()).map((e: ContributorEntry) => ({
      login: e.login,
      exactCommits: e.exactCommits,
      dirCommits: e.dirCommits,
      latestCommit: e.latestCommit,
    })),
    rankedReviewers: reviewers.map((r, i) => ({
      rank: i + 1,
      login: r.login,
      score: r.score,
      reasons: r.reasons,
    })),
    timestamp,
    validationStatus: 'pass',
    meta: {
      totalHistoryRecords,
      candidateCount,
      sampleCommits,
      endpoint: `/api/match`,
      scriptVersion: 'validate-match.ts@1.1',
    },
  };

  // 8. Write artifacts
  const artifactDir = join(process.cwd(), 'artifacts');
  mkdirSync(artifactDir, { recursive: true });

  // Write JSON artifact
  const jsonPath = join(artifactDir, 'match-validation.json');
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`[validate-match] JSON artifact written to artifacts/match-validation.json`);

  // 9. Build markdown artifact
  const mdLines: string[] = [
    '# PullMatch — Reviewer Match Validation',
    '',
    `**Date:** ${timestamp}`,
    `**Repo:** ${OWNER}/${REPO}`,
    `**PR:** #${PR_NUM}`,
    `**PR Author (excluded):** ${author ? `@${author}` : '(unknown)'}`,
    `**Script:** scripts/validate-match.ts`,
    `**Endpoint:** /api/match`,
    '',
    '## Files Changed (from GitHub API)',
    '',
    ...filenames.map((f) => `- \`${f}\``),
    '',
    `## History Analysis`,
    '',
    `- Commits/history records analyzed: **${totalHistoryRecords}** (across all changed files and parent directories)`,
    `- Candidate reviewers found: **${candidateCount}**`,
    `- PR author excluded: **${author ? `@${author}` : 'none'}**`,
    '',
    '## Raw GitHub API Sample',
    '',
    `Endpoint: \`GET /repos/${OWNER}/${REPO}/commits?path=${encodeURIComponent(sampleFile)}&per_page=5\``,
    '',
    '```json',
    JSON.stringify(sampleCommits, null, 2),
    '```',
    '',
    '## Final Top Reviewers',
    '',
    '| Rank | Username | Score | Reasons |',
    '|------|----------|-------|---------|',
    ...reviewers.map((r, i) =>
      `| ${i + 1} | @${r.login} | ${r.score} | ${r.reasons.join('; ')} |`
    ),
    '',
    '## Reviewer Details',
    '',
    ...reviewers.flatMap((r, i) => [
      `### ${i + 1}. @${r.login} (score: ${r.score})`,
      '',
      ...r.reasons.map((reason) => `- ${reason}`),
      '',
    ]),
    '## Validation Result',
    '',
    '- **Status:** PASS',
    `- **Token used:** GITHUB_TOKEN_WRITE`,
    `- **Author excluded:** ${author ? `@${author}` : 'none'}`,
    '- **Data source:** Live GitHub API — no fixtures or mocks',
    '- **Reproducibility:** Results are deterministic for the same repo/PR; recency scores vary with wall-clock time (expected)',
    '',
    '## Limitations',
    '',
    '- Recency scores shift over time as commits age past the 90-day decay window',
    '- Results reflect contributors with public GitHub profiles only',
    '- Directory-level commits use the parent directory path, not subdirectories',
    '',
    '---',
    '_Generated by scripts/validate-match.ts — live GitHub API data via GITHUB_TOKEN_WRITE, no mocks._',
  ];

  const mdPath = join(artifactDir, 'match-validation.md');
  writeFileSync(mdPath, mdLines.join('\n'));
  console.log(`[validate-match] Markdown artifact written to artifacts/match-validation.md`);

  console.log('\n[validate-match] PASS');
  console.log(`  Excluded author: @${author || '(none)'}`);
  console.log(`  Top reviewer: @${reviewers[0].login} (score: ${reviewers[0].score})`);
}

main().catch((err) => {
  console.error('[validate-match] FATAL:', err);
  process.exit(1);
});
