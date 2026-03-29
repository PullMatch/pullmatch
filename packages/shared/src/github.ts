const GITHUB_API = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 2_000;
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

function checkRateLimit(res: Response): void {
  const remaining = res.headers.get('X-RateLimit-Remaining');
  const resetHeader = res.headers.get('X-RateLimit-Reset');

  if (remaining !== null) {
    const remainingNum = parseInt(remaining, 10);
    if (remainingNum < RATE_LIMIT_WARNING_THRESHOLD) {
      const resetAt = resetHeader ? new Date(parseInt(resetHeader, 10) * 1000) : null;
      console.warn(`[github] Rate limit low: ${remainingNum} remaining${resetAt ? `, resets at ${resetAt.toISOString()}` : ''}`);
    }
  }

  if (res.status === 403 && remaining === '0') {
    const resetAt = resetHeader ? new Date(parseInt(resetHeader, 10) * 1000) : new Date();
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

  // Retry once on transient 5xx errors
  if (res.status >= 500) {
    console.warn(`[github] Server error ${res.status} for ${url}, retrying in ${RETRY_DELAY_MS}ms`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      res = await fetchWithTimeout(url, init);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`GitHub API request timed out after ${REQUEST_TIMEOUT_MS}ms (retry): ${url}`);
      }
      throw err;
    }
    checkRateLimit(res);
  }

  return res;
}

export interface PRFile {
  filename: string;
  status: string;
}

export interface Committer {
  login: string;
  date: string;
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

  const res = await fetch(url, {
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
