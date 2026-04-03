import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepoConfig, loadRepoConfig, filterIgnoredFiles, DEFAULT_CONFIG } from '../config.ts';

describe('parseRepoConfig', () => {
  it('returns defaults for empty string', () => {
    const config = parseRepoConfig('');
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });

  it('returns defaults for invalid YAML', () => {
    const config = parseRepoConfig(':::not valid yaml{{{');
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });

  it('returns defaults for non-object YAML', () => {
    const config = parseRepoConfig('42');
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });

  it('parses a full valid config', () => {
    const yaml = `
reviewers:
  count: 5
  exclude:
    - bot-user
    - vacation-person
  includeCodeowners: false
  weights:
    codeowners: 0.5
    recency: 0.2
    frequency: 0.3
ignore:
  - "*.md"
  - "docs/**"
`;
    const config = parseRepoConfig(yaml);
    assert.equal(config.reviewers.count, 5);
    assert.deepStrictEqual(config.reviewers.exclude, ['bot-user', 'vacation-person']);
    assert.equal(config.reviewers.includeCodeowners, false);
    assert.equal(config.reviewers.weights.codeowners, 0.5);
    assert.equal(config.reviewers.weights.recency, 0.2);
    assert.equal(config.reviewers.weights.frequency, 0.3);
    assert.deepStrictEqual(config.ignore, ['*.md', 'docs/**']);
  });

  it('uses defaults for missing fields', () => {
    const yaml = `
reviewers:
  count: 2
`;
    const config = parseRepoConfig(yaml);
    assert.equal(config.reviewers.count, 2);
    assert.deepStrictEqual(config.reviewers.exclude, []);
    assert.equal(config.reviewers.includeCodeowners, true);
    assert.deepStrictEqual(config.reviewers.weights, DEFAULT_CONFIG.reviewers.weights);
    assert.deepStrictEqual(config.ignore, []);
  });

  it('ignores invalid count values', () => {
    assert.equal(parseRepoConfig('reviewers:\n  count: -1').reviewers.count, 3);
    assert.equal(parseRepoConfig('reviewers:\n  count: 0').reviewers.count, 3);
    assert.equal(parseRepoConfig('reviewers:\n  count: 1.5').reviewers.count, 3);
    assert.equal(parseRepoConfig('reviewers:\n  count: "five"').reviewers.count, 3);
  });

  it('ignores invalid weight values', () => {
    const yaml = `
reviewers:
  weights:
    codeowners: -0.1
    recency: 1.5
    frequency: "bad"
`;
    const config = parseRepoConfig(yaml);
    assert.equal(config.reviewers.weights.codeowners, DEFAULT_CONFIG.reviewers.weights.codeowners);
    assert.equal(config.reviewers.weights.recency, DEFAULT_CONFIG.reviewers.weights.recency);
    assert.equal(config.reviewers.weights.frequency, DEFAULT_CONFIG.reviewers.weights.frequency);
  });

  it('allows weight values at boundaries (0 and 1)', () => {
    const yaml = `
reviewers:
  weights:
    codeowners: 0
    recency: 1
    frequency: 0.5
`;
    const config = parseRepoConfig(yaml);
    assert.equal(config.reviewers.weights.codeowners, 0);
    assert.equal(config.reviewers.weights.recency, 1);
    assert.equal(config.reviewers.weights.frequency, 0.5);
  });

  it('filters non-string entries from arrays', () => {
    const yaml = `
reviewers:
  exclude:
    - valid-user
    - 123
    - true
ignore:
  - "*.md"
  - 42
`;
    const config = parseRepoConfig(yaml);
    assert.deepStrictEqual(config.reviewers.exclude, ['valid-user']);
    assert.deepStrictEqual(config.ignore, ['*.md']);
  });

  it('parses loadBalancing and maxOpenReviews from config', () => {
    const yaml = `
reviewers:
  loadBalancing: true
  maxOpenReviews: 3
`;
    const config = parseRepoConfig(yaml);
    assert.equal(config.reviewers.loadBalancing, true);
    assert.equal(config.reviewers.maxOpenReviews, 3);
  });

  it('defaults loadBalancing to false and maxOpenReviews to 5', () => {
    const config = parseRepoConfig('reviewers:\n  count: 2');
    assert.equal(config.reviewers.loadBalancing, false);
    assert.equal(config.reviewers.maxOpenReviews, 5);
  });

  it('ignores invalid maxOpenReviews values', () => {
    assert.equal(parseRepoConfig('reviewers:\n  maxOpenReviews: -1').reviewers.maxOpenReviews, 5);
    assert.equal(parseRepoConfig('reviewers:\n  maxOpenReviews: 0').reviewers.maxOpenReviews, 5);
    assert.equal(parseRepoConfig('reviewers:\n  maxOpenReviews: "bad"').reviewers.maxOpenReviews, 5);
  });

  it('parses contextBriefs boolean', () => {
    assert.equal(parseRepoConfig('contextBriefs: false').contextBriefs, false);
    assert.equal(parseRepoConfig('contextBriefs: true').contextBriefs, true);
  });

  it('defaults contextBriefs to true', () => {
    assert.equal(parseRepoConfig('reviewers:\n  count: 2').contextBriefs, true);
  });

  it('handles partial weights (fills in defaults for missing)', () => {
    const yaml = `
reviewers:
  weights:
    recency: 0.5
`;
    const config = parseRepoConfig(yaml);
    assert.equal(config.reviewers.weights.recency, 0.5);
    assert.equal(config.reviewers.weights.codeowners, DEFAULT_CONFIG.reviewers.weights.codeowners);
    assert.equal(config.reviewers.weights.frequency, DEFAULT_CONFIG.reviewers.weights.frequency);
  });

  it('parses notifications.slack when webhookUrl is present', () => {
    const yaml = `
notifications:
  slack:
    webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX"
    channel: "#code-reviews"
`;
    const config = parseRepoConfig(yaml);
    assert.deepStrictEqual(config.notifications, {
      slack: {
        webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXX',
        channel: '#code-reviews',
      },
    });
  });

  it('ignores notifications.slack when webhookUrl is missing or invalid', () => {
    const missingWebhook = parseRepoConfig('notifications:\n  slack:\n    channel: "#reviews"');
    const invalidWebhook = parseRepoConfig('notifications:\n  slack:\n    webhookUrl: 123');
    const blankWebhook = parseRepoConfig('notifications:\n  slack:\n    webhookUrl: "   "');

    assert.deepStrictEqual(missingWebhook.notifications, {});
    assert.deepStrictEqual(invalidWebhook.notifications, {});
    assert.deepStrictEqual(blankWebhook.notifications, {});
  });
});

describe('filterIgnoredFiles', () => {
  it('returns all files when no ignore patterns', () => {
    const files = ['src/main.ts', 'README.md', 'docs/guide.md'];
    assert.deepStrictEqual(filterIgnoredFiles(files, []), files);
  });

  it('filters by extension pattern', () => {
    const files = ['src/main.ts', 'README.md', 'CHANGELOG.md', 'src/utils.ts'];
    const result = filterIgnoredFiles(files, ['*.md']);
    assert.deepStrictEqual(result, ['src/main.ts', 'src/utils.ts']);
  });

  it('filters by directory glob pattern', () => {
    const files = ['src/main.ts', 'docs/guide.md', 'docs/api/ref.md', 'README.md'];
    const result = filterIgnoredFiles(files, ['docs/**']);
    assert.deepStrictEqual(result, ['src/main.ts', 'README.md']);
  });

  it('applies multiple patterns', () => {
    const files = ['src/main.ts', 'docs/guide.md', 'README.md', 'test/foo.spec.ts'];
    const result = filterIgnoredFiles(files, ['*.md', 'docs/**']);
    assert.deepStrictEqual(result, ['src/main.ts', 'test/foo.spec.ts']);
  });

  it('returns empty array when all files are ignored', () => {
    const files = ['README.md', 'CHANGELOG.md'];
    const result = filterIgnoredFiles(files, ['*.md']);
    assert.deepStrictEqual(result, []);
  });
});

describe('loadRepoConfig', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns defaults when file not found (404)', async () => {
    globalThis.fetch = async () => new Response('Not Found', { status: 404 });
    const config = await loadRepoConfig('owner', 'repo', 'token');
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });

  it('returns defaults on network error', async () => {
    globalThis.fetch = async () => { throw new Error('Network failure'); };
    const config = await loadRepoConfig('owner', 'repo', 'token');
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });

  it('parses valid YAML from API response', async () => {
    const yaml = 'reviewers:\n  count: 5\nignore:\n  - "*.md"';
    globalThis.fetch = async () => new Response(yaml, { status: 200 });
    const config = await loadRepoConfig('owner', 'repo', 'token');
    assert.equal(config.reviewers.count, 5);
    assert.deepStrictEqual(config.ignore, ['*.md']);
  });

  it('returns defaults for malformed YAML response', async () => {
    globalThis.fetch = async () => new Response(':::broken{{{', { status: 200 });
    const config = await loadRepoConfig('owner', 'repo', 'token');
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });

  it('returns defaults on non-404 error', async () => {
    globalThis.fetch = async () => new Response('Server Error', { status: 500 });
    const config = await loadRepoConfig('owner', 'repo', 'token');
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });
});
