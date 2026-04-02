#!/usr/bin/env node
/**
 * analyze-pr.ts
 *
 * Run PullMatch reviewer analysis locally for any GitHub pull request.
 *
 * Usage:
 *   npx tsx scripts/analyze-pr.ts --repo owner/repo --pr 123 [--dry-run] [--token <github-token>] [--config path/to/.pullmatch.yml]
 *
 * Notes:
 *   - `--token` is optional when `GITHUB_TOKEN` is set.
 *   - Dry-run mode prints output only and does not post a PR comment.
 *   - Live mode (without `--dry-run`) posts the generated markdown comment.
 */

import {
  DEFAULT_CONFIG,
  buildContributorGraph,
  buildExpertiseMap,
  fetchPRCommitMessages,
  fetchPRFiles,
  filterIgnoredFiles,
  formatReviewerComment,
  generateContextBrief,
  getOpenReviewCounts,
  matchReviewers,
  matcherOptionsFromConfig,
  parseRepoConfig,
  postPRComment,
  type RepoConfig,
} from '../packages/shared/src/index.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface CliOptions {
  repo: string;
  pr: number;
  dryRun: boolean;
  token?: string;
  configPath?: string;
}

interface PullRequestMetadata {
  title: string;
  author: string;
}

function printUsage(): void {
  console.log(
    'Usage: npx tsx scripts/analyze-pr.ts --repo owner/repo --pr 123 [--dry-run] [--token <github-token>] [--config path/to/.pullmatch.yml]'
  );
}

function parseArgs(argv: string[]): CliOptions {
  let repo: string | undefined;
  let pr: number | undefined;
  let dryRun = false;
  let token: string | undefined;
  let configPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    const next = argv[index + 1];
    if ((arg === '--repo' || arg === '--pr' || arg === '--token' || arg === '--config') && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === '--repo') {
      repo = next;
      index += 1;
      continue;
    }

    if (arg === '--pr') {
      pr = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--token') {
      token = next;
      index += 1;
      continue;
    }

    if (arg === '--config') {
      configPath = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!repo) {
    throw new Error('Missing required --repo owner/repo');
  }

  const [owner, repoName, extra] = repo.split('/');
  if (!owner || !repoName || extra) {
    throw new Error(`Invalid --repo value: ${repo}. Expected owner/repo`);
  }

  if (!Number.isInteger(pr) || (pr ?? 0) <= 0) {
    throw new Error('Missing or invalid --pr value. Expected a positive integer');
  }

  return {
    repo,
    pr,
    dryRun,
    token,
    configPath,
  };
}

function loadConfig(configPath?: string): { config: RepoConfig; source: string } {
  if (!configPath) {
    return {
      config: { ...DEFAULT_CONFIG },
      source: 'default (DEFAULT_CONFIG)',
    };
  }

  const absolutePath = resolve(configPath);
  const raw = readFileSync(absolutePath, 'utf8');
  const parsed = parseRepoConfig(raw);
  return {
    config: parsed,
    source: `file (${absolutePath})`,
  };
}

async function fetchPRMetadata(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PullRequestMetadata> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status} loading PR metadata: ${await response.text()}`);
  }

  const payload = await response.json() as { title?: string; user?: { login?: string } };

  return {
    title: payload.title ?? `PR #${prNumber}`,
    author: payload.user?.login ?? '',
  };
}

function printReviewerDetails(
  recommendations: Array<{ login: string; score: number; reasons: string[] }>,
  briefs: Map<string, { reviewer: string; brief: string }>
): void {
  console.log('\n=== Reviewer Matches ===');
  if (recommendations.length === 0) {
    console.log('No reviewer candidates found.');
    return;
  }

  for (const recommendation of recommendations) {
    console.log(`\n@${recommendation.login} (score: ${recommendation.score})`);
    console.log('Reasons:');
    for (const reason of recommendation.reasons) {
      console.log(`- ${reason}`);
    }

    const brief = briefs.get(recommendation.login);
    console.log('Context brief:');
    if (!brief) {
      console.log('- unavailable');
      continue;
    }

    for (const line of brief.brief.split('\n')) {
      console.log(line);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const token = options.token ?? process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('Missing GitHub token. Provide --token or set GITHUB_TOKEN');
  }

  const [owner, repoName] = options.repo.split('/');
  const { config, source: configSource } = loadConfig(options.configPath);

  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'live'}`);
  console.log(`Repo: ${options.repo}`);
  console.log(`PR: #${options.pr}`);

  const prMetadata = await fetchPRMetadata(owner, repoName, options.pr, token);
  console.log(`Title: ${prMetadata.title}`);
  console.log(`Author: ${prMetadata.author || '(unknown)'}`);

  const prFiles = await fetchPRFiles(owner, repoName, options.pr, token);
  const changedFiles = prFiles.map((file) => file.filename);
  const filteredFiles = filterIgnoredFiles(changedFiles, config.ignore);

  console.log(`Changed files: ${changedFiles.length}`);
  console.log(`After ignore filters: ${filteredFiles.length}`);

  const graph = await buildContributorGraph(owner, repoName, filteredFiles, token);
  const matcherOptions = matcherOptionsFromConfig(config.reviewers);

  if (config.reviewers.loadBalancing && graph.size > 0) {
    const candidateLogins = Array.from(graph.keys()).filter((login) => login !== prMetadata.author);
    if (candidateLogins.length > 0) {
      matcherOptions.reviewLoadData = await getOpenReviewCounts(owner, repoName, candidateLogins, token);
    }
  }

  const recommendations = graph.size > 0
    ? matchReviewers(graph, prMetadata.author, matcherOptions)
    : [];

  const expertiseMap = graph.size > 0 ? buildExpertiseMap(graph, filteredFiles) : {};
  const commitMessages = await fetchPRCommitMessages(owner, repoName, options.pr, token);
  const generatedBriefs = generateContextBrief(recommendations, filteredFiles, commitMessages, expertiseMap);
  const briefs = new Map(generatedBriefs.map((brief) => [brief.reviewer, brief]));

  const comment = formatReviewerComment({
    title: prMetadata.title,
    recommendations,
    briefs,
    expertiseMap,
  });

  printReviewerDetails(recommendations, briefs);

  console.log('\n=== Effective Config ===');
  console.log(`Source: ${configSource}`);
  console.log(JSON.stringify(config, null, 2));

  console.log('\n=== Markdown Comment Preview ===');
  console.log(comment);

  if (options.dryRun) {
    console.log('\nDry-run enabled. No comment posted.');
    return;
  }

  await postPRComment(owner, repoName, options.pr, comment, token);
  console.log('\nLive mode: comment posted to the PR.');
}

main().catch((error: unknown) => {
  console.error(`[analyze-pr] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  printUsage();
  process.exit(1);
});
