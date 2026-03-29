import { parse as parseYaml } from 'yaml';
import { minimatch } from 'minimatch';

const GITHUB_API = 'https://api.github.com';

export interface ReviewerWeights {
  codeowners: number;
  recency: number;
  frequency: number;
}

export interface ReviewerConfig {
  count: number;
  exclude: string[];
  includeCodeowners: boolean;
  weights: ReviewerWeights;
}

export interface RepoConfig {
  reviewers: ReviewerConfig;
  ignore: string[];
}

export const DEFAULT_CONFIG: RepoConfig = {
  reviewers: {
    count: 3,
    exclude: [],
    includeCodeowners: true,
    weights: {
      codeowners: 0.4,
      recency: 0.3,
      frequency: 0.3,
    },
  },
  ignore: [],
};

/**
 * Parse a raw YAML string into a validated RepoConfig, falling back to defaults
 * for any missing or invalid fields.
 */
export function parseRepoConfig(raw: string): RepoConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    console.warn('[config] Failed to parse .pullmatch.yml YAML:', err instanceof Error ? err.message : String(err));
    return { ...DEFAULT_CONFIG };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ...DEFAULT_CONFIG };
  }

  const doc = parsed as Record<string, unknown>;
  const rev = doc.reviewers as Record<string, unknown> | undefined;

  const reviewers: ReviewerConfig = {
    count: validPositiveInt(rev?.count, DEFAULT_CONFIG.reviewers.count),
    exclude: validStringArray(rev?.exclude, DEFAULT_CONFIG.reviewers.exclude),
    includeCodeowners: validBool(rev?.includeCodeowners, DEFAULT_CONFIG.reviewers.includeCodeowners),
    weights: validWeights(rev?.weights as Record<string, unknown> | undefined),
  };

  const ignore = validStringArray(doc.ignore, DEFAULT_CONFIG.ignore);

  return { reviewers, ignore };
}

/**
 * Load .pullmatch.yml from a repo via the GitHub Contents API.
 * Returns default config if the file doesn't exist or can't be parsed.
 */
export async function loadRepoConfig(
  owner: string,
  repo: string,
  token?: string,
): Promise<RepoConfig> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/.pullmatch.yml`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3.raw',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 404) {
        console.debug('[config] No .pullmatch.yml found — using defaults');
      } else {
        console.warn(`[config] GitHub API error ${res.status} loading .pullmatch.yml`);
      }
      return { ...DEFAULT_CONFIG };
    }
    const raw = await res.text();
    return parseRepoConfig(raw);
  } catch (err) {
    console.warn('[config] Failed to load .pullmatch.yml:', err instanceof Error ? err.message : String(err));
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Filter a list of filenames by the ignore patterns from config.
 * Returns only the files that do NOT match any ignore pattern.
 */
export function filterIgnoredFiles(files: string[], ignorePatterns: string[]): string[] {
  if (ignorePatterns.length === 0) return files;
  return files.filter((f) => !ignorePatterns.some((pattern) => minimatch(f, pattern)));
}

// --- Validation helpers ---

function validPositiveInt(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isInteger(val) && val > 0) return val;
  return fallback;
}

function validStringArray(val: unknown, fallback: string[]): string[] {
  if (!Array.isArray(val)) return fallback;
  return val.filter((v) => typeof v === 'string');
}

function validBool(val: unknown, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val;
  return fallback;
}

function validWeights(val: Record<string, unknown> | undefined): ReviewerWeights {
  const defaults = DEFAULT_CONFIG.reviewers.weights;
  if (!val || typeof val !== 'object') return { ...defaults };

  return {
    codeowners: validWeight(val.codeowners, defaults.codeowners),
    recency: validWeight(val.recency, defaults.recency),
    frequency: validWeight(val.frequency, defaults.frequency),
  };
}

function validWeight(val: unknown, fallback: number): number {
  if (typeof val === 'number' && val >= 0 && val <= 1) return val;
  return fallback;
}
