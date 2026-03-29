const GITHUB_API = 'https://api.github.com';

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
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
  const res = await fetch(url, { headers: headers(token) });
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
  const res = await fetch(url, {
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
  const res = await fetch(url, { headers: headers(token) });
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
