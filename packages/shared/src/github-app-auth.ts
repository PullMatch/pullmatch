import { createSign } from 'node:crypto';

const GITHUB_API = 'https://api.github.com';

// Installation tokens last 1 hour; refresh 5 minutes early
const TOKEN_TTL_MS = 55 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<number, CachedToken>();

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

/**
 * Create a JWT signed with the GitHub App's private key.
 * Valid for 10 minutes per GitHub's requirements.
 */
function createAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iat: now - 60, // 60s clock drift allowance
      exp: now + 600, // 10 minute max
      iss: appId,
    })
  );

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, 'base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Fetch an installation access token from GitHub, with in-memory caching.
 */
async function fetchInstallationToken(
  installationId: number,
  appId: string,
  privateKey: string
): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const jwt = createAppJwt(appId, privateKey);
  const url = `${GITHUB_API}/app/installations/${installationId}/access_tokens`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(
      `GitHub App token error ${res.status} for installation ${installationId}: ${await res.text()}`
    );
  }

  const data = (await res.json()) as { token: string };
  tokenCache.set(installationId, {
    token: data.token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  return data.token;
}

export interface TokenResolverConfig {
  appId: string;
  privateKey: string;
  fallbackToken?: string;
}

/**
 * Resolve a GitHub token for the given installation.
 *
 * Priority:
 *  1. If installationId is provided, fetch/cache an installation token via GitHub App auth.
 *  2. Fall back to the static fallbackToken (e.g. GITHUB_TOKEN_WRITE env var).
 *  3. Return undefined if neither is available.
 */
export async function resolveInstallationToken(
  installationId: number | undefined,
  config: TokenResolverConfig
): Promise<string | undefined> {
  if (installationId && config.appId && config.privateKey) {
    return fetchInstallationToken(installationId, config.appId, config.privateKey);
  }
  return config.fallbackToken;
}

/**
 * Clear the token cache. Useful for testing.
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/**
 * Visible for testing: get current cache size.
 */
export function getTokenCacheSize(): number {
  return tokenCache.size;
}
