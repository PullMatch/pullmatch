const GITHUB_API = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_5XX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RATE_LIMIT_WARNING_THRESHOLD = 10;

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export class GitHubRateLimitError extends Error {
  public readonly resetAt: Date;
  constructor(resetAt: Date) {
    super(`GitHub API rate limit exceeded. Resets at ${resetAt.toISOString()}`);
    this.name = 'GitHubRateLimitError';
    this.resetAt = resetAt;
  }
}

export interface GitHubRateLimitStatus {
  limit: number | null;
  remaining: number | null;
  resetAt: Date | null;
  isLow: boolean;
}

let latestRateLimitStatus: GitHubRateLimitStatus | null = null;

function parseRateLimitStatus(res: Response): GitHubRateLimitStatus | null {
  const limitHeader = res.headers.get('X-RateLimit-Limit');
  const remainingHeader = res.headers.get('X-RateLimit-Remaining');
  const resetHeader = res.headers.get('X-RateLimit-Reset');
  if (limitHeader === null && remainingHeader === null && resetHeader === null) {
    return null;
  }

  const limit = limitHeader !== null ? Number.parseInt(limitHeader, 10) : null;
  const remaining = remainingHeader !== null ? Number.parseInt(remainingHeader, 10) : null;
  const resetAt = resetHeader !== null ? new Date(Number.parseInt(resetHeader, 10) * 1000) : null;

  return {
    limit: Number.isFinite(limit) ? limit : null,
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt: resetAt && !Number.isNaN(resetAt.getTime()) ? resetAt : null,
    isLow: remaining !== null && Number.isFinite(remaining) && remaining < RATE_LIMIT_WARNING_THRESHOLD,
  };
}

export function getLatestRateLimitStatus(): GitHubRateLimitStatus | null {
  return latestRateLimitStatus ? { ...latestRateLimitStatus } : null;
}

function checkRateLimit(res: Response): void {
  const status = parseRateLimitStatus(res);
  if (!status) return;

  latestRateLimitStatus = status;
  if (status.isLow) {
    console.warn(`[github] Rate limit low: ${status.remaining ?? 'unknown'} remaining${status.resetAt ? `, resets at ${status.resetAt.toISOString()}` : ''}`);
  }

  if (res.status === 403 && status.remaining === 0) {
    const resetAt = status.resetAt ?? new Date();
    throw new GitHubRateLimitError(resetAt);
  }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function githubFetch(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_5XX_RETRIES; attempt += 1) {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, init);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`GitHub API request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
      }
      throw err;
    }

    checkRateLimit(res);
    if (res.status < 500 || attempt === MAX_5XX_RETRIES) {
      return res;
    }

    const delayMs = RETRY_BASE_DELAY_MS * (2 ** attempt);
    console.warn(`[github] Server error ${res.status} for ${url}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_5XX_RETRIES})`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Unreachable');
}

export interface PRFile {
  filename: string;
  status: string;
}

export interface Committer {
  login: string;
  date: string;
}

export async function fetchPRCommitMessages(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
): Promise<string[]> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`;
  console.debug(`[github] GET ${url}`);
  const res = await githubFetch(url, { headers: headers(token) });
  if (!res.ok) {
    console.warn(`[github] fetchPRCommitMessages non-critical error ${res.status} for PR #${prNumber}`);
    return [];
  }

  const commits = await res.json() as Array<{ commit?: { message?: string } }>;
  return commits
    .map((entry) => entry.commit?.message?.trim())
    .filter((message): message is string => Boolean(message && message.length > 0));
}

export async function fetchPRFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
): Promise<PRFile[]> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`;
  console.debug(`[github] GET ${url}`);
  const res = await githubFetch(url, { headers: headers(token) });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json() as Array<{ filename: string; status: string }>;
  console.debug(`[github] fetchPRFiles returned ${data.length} file(s)`);
  return data.map((f) => ({ filename: f.filename, status: f.status }));
}

/** HTML marker injected into PullMatch comments for dedup */
export const PULLMATCH_MARKER = '<!-- pullmatch-reviewer-suggestions -->';

export async function postPRComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  token: string
): Promise<void> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  const res = await githubFetch(url, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} posting comment: ${await res.text()}`);
  }
}

export async function findExistingComment(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<number | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`;
  const res = await githubFetch(url, { headers: headers(token) });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} listing comments: ${await res.text()}`);
  }
  const comments = await res.json() as Array<{ id: number; body?: string }>;
  for (const c of comments) {
    if (c.body?.includes(PULLMATCH_MARKER)) {
      return c.id;
    }
  }
  return null;
}

export async function updatePRComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string,
  token: string
): Promise<void> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${commentId}`;
  const res = await githubFetch(url, {
    method: 'PATCH',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} updating comment: ${await res.text()}`);
  }
}

export async function fetchRecentCommitters(
  owner: string,
  repo: string,
  filename: string,
  token?: string,
  maxCommits = 30
): Promise<Committer[]> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/commits?path=${encodeURIComponent(filename)}&per_page=${maxCommits}`;
  console.debug(`[github] GET ${url}`);
  const res = await githubFetch(url, { headers: headers(token) });
  if (!res.ok) {
    // Non-critical: return empty on error (e.g. file not in default branch yet)
    console.debug(`[github] fetchRecentCommitters non-critical error ${res.status} for ${filename}`);
    return [];
  }
  const data = await res.json() as Array<{
    author?: { login: string } | null;
    commit: { author: { date: string } };
  }>;
  return data
    .filter((c) => c.author?.login)
    .map((c) => ({
      login: c.author!.login,
      date: c.commit.author.date,
    }));
}

export interface RequestReviewersResult {
  requested: string[];
  failed: string[];
}

export async function getOpenReviewCount(
  owner: string,
  repo: string,
  login: string,
  token?: string
): Promise<number> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&per_page=100`;
  console.debug(`[github] GET ${url} (checking review load for ${login})`);
  const res = await githubFetch(url, { headers: headers(token) });
  if (!res.ok) {
    console.warn(`[github] getOpenReviewCount error ${res.status} for ${login}`);
    return 0;
  }
  const pulls = await res.json() as Array<{ requested_reviewers?: Array<{ login: string }> }>;
  return pulls.filter((pr) =>
    pr.requested_reviewers?.some((r) => r.login.toLowerCase() === login.toLowerCase())
  ).length;
}

export async function getOpenReviewCounts(
  owner: string,
  repo: string,
  logins: string[],
  token?: string
): Promise<Map<string, number>> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&per_page=100`;
  console.debug(`[github] GET ${url} (checking review load for ${logins.length} reviewers)`);
  const res = await githubFetch(url, { headers: headers(token) });
  if (!res.ok) {
    console.warn(`[github] getOpenReviewCounts error ${res.status}`);
    return new Map();
  }
  const pulls = await res.json() as Array<{ requested_reviewers?: Array<{ login: string }> }>;
  const counts = new Map<string, number>();
  const loginSet = new Set(logins.map((l) => l.toLowerCase()));
  for (const pr of pulls) {
    for (const reviewer of pr.requested_reviewers ?? []) {
      const lower = reviewer.login.toLowerCase();
      if (loginSet.has(lower)) {
        counts.set(reviewer.login, (counts.get(reviewer.login) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export async function requestReviewers(
  owner: string,
  repo: string,
  prNumber: number,
  logins: string[],
  token: string
): Promise<RequestReviewersResult> {
  if (logins.length === 0) return { requested: [], failed: [] };

  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`;
  console.debug(`[github] POST ${url} reviewers=${logins.join(',')}`);

  const res = await githubFetch(url, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewers: logins }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 422) {
      console.warn(`[github] Some reviewers could not be requested (422): ${body}`);
      return { requested: [], failed: logins };
    }
    throw new Error(`GitHub API error ${res.status} requesting reviewers: ${body}`);
  }

  const data = await res.json() as { requested_reviewers?: Array<{ login: string }> };
  const actuallyRequested = (data.requested_reviewers ?? []).map((r) => r.login);

  const requested = logins.filter((l) => actuallyRequested.includes(l));
  const failed = logins.filter((l) => !actuallyRequested.includes(l));

  if (failed.length > 0) {
    console.warn(`[github] Some reviewers not in requested list: ${failed.join(', ')}`);
  }

  return { requested, failed };
}
