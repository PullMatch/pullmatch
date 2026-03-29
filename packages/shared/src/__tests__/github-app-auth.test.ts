import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  resolveInstallationToken,
  clearTokenCache,
  getTokenCacheSize,
  type TokenResolverConfig,
} from '../github-app-auth.ts';

// Generate a test RSA key pair once for all tests
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const TEST_APP_ID = '12345';
const TEST_INSTALLATION_ID = 67890;

function makeConfig(overrides?: Partial<TokenResolverConfig>): TokenResolverConfig {
  return {
    appId: TEST_APP_ID,
    privateKey,
    fallbackToken: 'ghp_fallback_token',
    ...overrides,
  };
}

describe('resolveInstallationToken', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    clearTokenCache();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('falls back to static token when no installationId is provided', async () => {
    const config = makeConfig();
    const token = await resolveInstallationToken(undefined, config);
    assert.equal(token, 'ghp_fallback_token');
  });

  it('returns undefined when no installationId and no fallback', async () => {
    const config = makeConfig({ fallbackToken: undefined });
    const token = await resolveInstallationToken(undefined, config);
    assert.equal(token, undefined);
  });

  it('falls back to static token when appId is missing', async () => {
    const config = makeConfig({ appId: '' });
    const token = await resolveInstallationToken(TEST_INSTALLATION_ID, config);
    assert.equal(token, 'ghp_fallback_token');
  });

  it('fetches installation token from GitHub API', async () => {
    const mockFetch = mock.fn(async () =>
      new Response(JSON.stringify({ token: 'ghs_installation_token_abc' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const config = makeConfig();
    const token = await resolveInstallationToken(TEST_INSTALLATION_ID, config);

    assert.equal(token, 'ghs_installation_token_abc');
    assert.equal(mockFetch.mock.callCount(), 1);

    // Verify the request was made to the correct endpoint
    const call = mockFetch.mock.calls[0] as unknown as { arguments: [string, RequestInit] };
    assert.equal(call.arguments[0], `https://api.github.com/app/installations/${TEST_INSTALLATION_ID}/access_tokens`);
    assert.equal(call.arguments[1].method, 'POST');

    // Verify JWT was sent in Authorization header
    const authHeader = (call.arguments[1].headers as Record<string, string>)['Authorization'];
    assert.ok(authHeader?.startsWith('Bearer '), 'Should have Bearer token');
    const jwt = authHeader.split(' ')[1];
    const parts = jwt.split('.');
    assert.equal(parts.length, 3, 'JWT should have 3 parts');
  });

  it('caches installation tokens and reuses them', async () => {
    const mockFetch = mock.fn(async () =>
      new Response(JSON.stringify({ token: 'ghs_cached_token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const config = makeConfig();

    // First call fetches from API
    const token1 = await resolveInstallationToken(TEST_INSTALLATION_ID, config);
    assert.equal(token1, 'ghs_cached_token');
    assert.equal(mockFetch.mock.callCount(), 1);
    assert.equal(getTokenCacheSize(), 1);

    // Second call should use cache
    const token2 = await resolveInstallationToken(TEST_INSTALLATION_ID, config);
    assert.equal(token2, 'ghs_cached_token');
    assert.equal(mockFetch.mock.callCount(), 1, 'Should not make a second API call');
  });

  it('caches tokens per installation ID', async () => {
    let callCount = 0;
    const mockFetch = mock.fn(async () => {
      callCount++;
      return new Response(JSON.stringify({ token: `ghs_token_${callCount}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const config = makeConfig();

    const token1 = await resolveInstallationToken(11111, config);
    const token2 = await resolveInstallationToken(22222, config);

    assert.equal(token1, 'ghs_token_1');
    assert.equal(token2, 'ghs_token_2');
    assert.equal(mockFetch.mock.callCount(), 2);
    assert.equal(getTokenCacheSize(), 2);
  });

  it('throws on GitHub API error', async () => {
    const mockFetch = mock.fn(async () =>
      new Response('Bad credentials', { status: 401 })
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const config = makeConfig();

    await assert.rejects(
      () => resolveInstallationToken(TEST_INSTALLATION_ID, config),
      (err: Error) => {
        assert.ok(err.message.includes('401'));
        assert.ok(err.message.includes(String(TEST_INSTALLATION_ID)));
        return true;
      }
    );
  });

  it('clearTokenCache empties the cache', async () => {
    const mockFetch = mock.fn(async () =>
      new Response(JSON.stringify({ token: 'ghs_will_be_cleared' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const config = makeConfig();
    await resolveInstallationToken(TEST_INSTALLATION_ID, config);
    assert.equal(getTokenCacheSize(), 1);

    clearTokenCache();
    assert.equal(getTokenCacheSize(), 0);

    // Next call should fetch again
    await resolveInstallationToken(TEST_INSTALLATION_ID, config);
    assert.equal(mockFetch.mock.callCount(), 2);
  });
});
