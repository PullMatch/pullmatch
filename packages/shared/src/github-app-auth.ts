import { createAppAuth } from '@octokit/auth-app';

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  installationId: number;
}

export interface InstallationToken {
  token: string;
  expiresAt: string;
}

/**
 * Read GitHub App credentials from environment variables.
 * Returns null if any required var is missing (allowing fallback to GITHUB_TOKEN).
 */
export function getAppConfigFromEnv(): GitHubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    return null;
  }

  return {
    appId,
    privateKey,
    installationId: Number(installationId),
  };
}

/**
 * Get a short-lived installation access token for a GitHub App.
 * Uses @octokit/auth-app to sign a JWT and exchange it for an installation token.
 */
export async function getInstallationToken(config: GitHubAppConfig): Promise<InstallationToken> {
  const auth = createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: config.installationId,
  });

  const result = await auth({ type: 'installation' });

  return {
    token: result.token,
    expiresAt: result.expiresAt,
  };
}

/**
 * Resolve a GitHub token: prefer App installation token, fall back to GITHUB_TOKEN_WRITE.
 * Returns undefined if neither is available.
 */
export async function resolveGitHubToken(): Promise<string | undefined> {
  const appConfig = getAppConfigFromEnv();

  if (appConfig) {
    try {
      const { token } = await getInstallationToken(appConfig);
      return token;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[github-app-auth] Failed to get installation token: ${message}`);
      // Fall through to GITHUB_TOKEN_WRITE
    }
  }

  return process.env.GITHUB_TOKEN_WRITE;
}
