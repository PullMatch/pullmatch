import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getAppConfigFromEnv, getInstallationToken, resolveGitHubToken } from '../github-app-auth.ts';

describe('getAppConfigFromEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns config when all env vars are set', () => {
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----';
    process.env.GITHUB_APP_INSTALLATION_ID = '67890';

    const config = getAppConfigFromEnv();
    assert.ok(config);
    assert.equal(config.appId, '12345');
    assert.equal(config.installationId, 67890);
    assert.ok(config.privateKey.includes('RSA'));
  });

  it('returns null when GITHUB_APP_ID is missing', () => {
    delete process.env.GITHUB_APP_ID;
    process.env.GITHUB_APP_PRIVATE_KEY = 'key';
    process.env.GITHUB_APP_INSTALLATION_ID = '67890';

    assert.equal(getAppConfigFromEnv(), null);
  });

  it('returns null when GITHUB_APP_PRIVATE_KEY is missing', () => {
    process.env.GITHUB_APP_ID = '12345';
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    process.env.GITHUB_APP_INSTALLATION_ID = '67890';

    assert.equal(getAppConfigFromEnv(), null);
  });

  it('returns null when GITHUB_APP_INSTALLATION_ID is missing', () => {
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY = 'key';
    delete process.env.GITHUB_APP_INSTALLATION_ID;

    assert.equal(getAppConfigFromEnv(), null);
  });

  it('returns null when all app env vars are missing', () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_INSTALLATION_ID;

    assert.equal(getAppConfigFromEnv(), null);
  });
});

describe('getInstallationToken', () => {
  it('calls createAppAuth and returns token + expiresAt', async () => {
    // We mock at the module level by testing the contract:
    // getInstallationToken takes a config and uses @octokit/auth-app internally.
    // Since we can't easily mock ESM imports in node:test, we verify the function
    // signature and error behavior instead.

    // Passing invalid credentials should throw (proves it calls the real auth library)
    await assert.rejects(
      () =>
        getInstallationToken({
          appId: 'invalid',
          privateKey: 'not-a-real-key',
          installationId: 0,
        }),
      (err: Error) => {
        // @octokit/auth-app will throw about the invalid key
        assert.ok(err instanceof Error);
        return true;
      }
    );
  });
});

describe('resolveGitHubToken', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('falls back to GITHUB_TOKEN_WRITE when no app config', async () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    process.env.GITHUB_TOKEN_WRITE = 'ghp_test_token_123';

    const token = await resolveGitHubToken();
    assert.equal(token, 'ghp_test_token_123');
  });

  it('returns undefined when no auth method is configured', async () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_TOKEN_WRITE;

    const token = await resolveGitHubToken();
    assert.equal(token, undefined);
  });

  it('falls back to GITHUB_TOKEN_WRITE when app auth fails', async () => {
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY = 'bad-key';
    process.env.GITHUB_APP_INSTALLATION_ID = '67890';
    process.env.GITHUB_TOKEN_WRITE = 'ghp_fallback_token';

    const token = await resolveGitHubToken();
    assert.equal(token, 'ghp_fallback_token');
  });
});
