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
  const res = await fetch(url, {
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
  const res = await fetch(url, { headers: headers(token) });
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
  const res = await fetch(url, {
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
