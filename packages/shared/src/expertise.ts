import type { ContributorEntry } from './contributor-graph.ts';

export interface ExpertiseDomain {
  domain: string;
  score: number;
}

/** Maps login -> array of expertise domains sorted by score descending */
export type ExpertiseMap = Record<string, ExpertiseDomain[]>;

interface DomainRule {
  domain: string;
  /** Glob-like patterns matched against file paths */
  patterns: RegExp[];
}

const DOMAIN_RULES: DomainRule[] = [
  {
    domain: 'Frontend',
    patterns: [
      /\.(css|scss|less|sass|styl)$/,
      /\.(tsx|jsx)$/,
      /\/components\//,
      /\/pages\//,
      /\/views\//,
      /\/styles\//,
    ],
  },
  {
    domain: 'API',
    patterns: [
      /\/api\//,
      /\/routes\//,
      /\/endpoints\//,
      /\/handlers\//,
      /\/controllers\//,
      /\/middleware\//,
    ],
  },
  {
    domain: 'Database',
    patterns: [
      /\/migrations?\//,
      /\/models?\//,
      /\/schema/,
      /\/seeds?\//,
      /\.sql$/,
      /\/prisma\//,
      /\/drizzle\//,
    ],
  },
  {
    domain: 'DevOps',
    patterns: [
      /Dockerfile/,
      /docker-compose/,
      /fly\.toml$/,
      /\.github\/workflows\//,
      /\.gitlab-ci/,
      /Jenkinsfile/,
      /\.circleci\//,
      /terraform\//,
      /\.k8s\//,
      /kubernetes\//,
      /nginx/,
    ],
  },
  {
    domain: 'Testing',
    patterns: [
      /\.test\.[^/]+$/,
      /\.spec\.[^/]+$/,
      /\/__tests__\//,
      /\/test\//,
      /\/tests\//,
      /\/fixtures\//,
    ],
  },
  {
    domain: 'Config',
    patterns: [
      /\.config\.[^/]+$/,
      /\.env/,
      /tsconfig/,
      /package\.json$/,
      /\.eslint/,
      /\.prettier/,
    ],
  },
  {
    domain: 'Docs',
    patterns: [
      /\.md$/,
      /\.mdx$/,
      /\/docs\//,
      /README/,
      /CHANGELOG/,
    ],
  },
];

/**
 * Classify a file path into zero or more expertise domains.
 */
export function classifyFile(filepath: string): string[] {
  const domains: string[] = [];
  for (const rule of DOMAIN_RULES) {
    if (rule.patterns.some((p) => p.test(filepath))) {
      domains.push(rule.domain);
    }
  }
  return domains;
}

/**
 * Build an expertise map from a contributor graph.
 *
 * For each contributor, counts how many of their committed files fall into each
 * domain. Uses exactCommits as a proxy — each file the contributor touched
 * counts once per matching domain.
 *
 * Since the contributor graph doesn't store per-file breakdowns, we use
 * the changed files list to infer domains and weight by the contributor's
 * exact commit count in those areas.
 */
export function buildExpertiseMap(
  graph: Map<string, ContributorEntry>,
  changedFiles: string[]
): ExpertiseMap {
  // Classify all changed files into domains
  const fileDomains = new Map<string, string[]>();
  for (const file of changedFiles) {
    const domains = classifyFile(file);
    if (domains.length > 0) {
      fileDomains.set(file, domains);
    }
  }

  // Count unique domains across all changed files
  const domainFileCounts = new Map<string, number>();
  for (const domains of fileDomains.values()) {
    for (const d of domains) {
      domainFileCounts.set(d, (domainFileCounts.get(d) ?? 0) + 1);
    }
  }

  const result: ExpertiseMap = {};

  for (const entry of graph.values()) {
    // Weight each domain by the contributor's commit activity
    // exactCommits indicates deep involvement; dirCommits indicates breadth
    const totalCommits = entry.exactCommits + entry.dirCommits;
    if (totalCommits === 0) continue;

    const domainScores = new Map<string, number>();

    for (const [domain, fileCount] of domainFileCounts) {
      // Score = contributor's exact commits * proportion of changed files in this domain
      const domainWeight = fileCount / changedFiles.length;
      const score = Math.round(entry.exactCommits * domainWeight + entry.dirCommits * domainWeight * 0.3);
      if (score > 0) {
        domainScores.set(domain, score);
      }
    }

    if (domainScores.size > 0) {
      result[entry.login] = Array.from(domainScores.entries())
        .map(([domain, score]) => ({ domain, score }))
        .sort((a, b) => b.score - a.score);
    }
  }

  return result;
}

/**
 * Format a short expertise tag for a reviewer.
 * Returns the top domain with commit count, e.g. "API specialist, 12 commits"
 * Returns undefined if no expertise data exists.
 */
export function formatExpertiseTag(
  login: string,
  expertiseMap: ExpertiseMap
): string | undefined {
  const domains = expertiseMap[login];
  if (!domains || domains.length === 0) return undefined;

  const top = domains[0];
  return `${top.domain} specialist, ${top.score} commit(s)`;
}
