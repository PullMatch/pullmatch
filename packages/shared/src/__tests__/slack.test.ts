import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatSlackMessage, sendSlackNotification } from '../slack.ts';

describe('formatSlackMessage', () => {
  it('includes PR metadata and suggested reviewers in blocks', () => {
    const message = formatSlackMessage(
      {
        title: 'Improve matcher stability',
        author: 'dev-user',
        htmlUrl: 'https://github.com/acme/pullmatch/pull/42',
        repo: 'acme/pullmatch',
        prNumber: 42,
      },
      [
        { login: 'alice', score: 12.3 },
        { login: 'bob', score: 9.7 },
      ]
    );

    assert.ok(message.text.includes('PR #42'));
    assert.equal(message.blocks.length, 4);

    const reviewerSection = message.blocks[2] as { text?: { text?: string } };
    assert.ok(reviewerSection.text?.text?.includes('@alice'));
    assert.ok(reviewerSection.text?.text?.includes('@bob'));
  });

  it('handles empty reviewer list', () => {
    const message = formatSlackMessage(
      {
        title: 'No matches',
        author: 'dev-user',
        htmlUrl: 'https://github.com/acme/pullmatch/pull/99',
        repo: 'acme/pullmatch',
        prNumber: 99,
      },
      []
    );

    const reviewerSection = message.blocks[2] as { text?: { text?: string } };
    assert.ok(reviewerSection.text?.text?.includes('No reviewer suggestions available.'));
  });
});

describe('sendSlackNotification', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts JSON payload to incoming webhook URL', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    let capturedMethod = '';

    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = String(init?.method);
      capturedBody = String(init?.body);
      return new Response('ok', { status: 200 });
    };

    const message = formatSlackMessage(
      {
        title: 'Improve matcher stability',
        author: 'dev-user',
        htmlUrl: 'https://github.com/acme/pullmatch/pull/42',
        repo: 'acme/pullmatch',
        prNumber: 42,
      },
      [{ login: 'alice', score: 12.3 }]
    );

    await sendSlackNotification('https://hooks.slack.com/services/T000/B000/XXXX', message);

    assert.equal(capturedUrl, 'https://hooks.slack.com/services/T000/B000/XXXX');
    assert.equal(capturedMethod, 'POST');
    assert.deepStrictEqual(JSON.parse(capturedBody), message);
  });

  it('throws when webhook responds with non-2xx status', async () => {
    globalThis.fetch = async () => new Response('invalid token', { status: 403 });
    const message = formatSlackMessage(
      {
        title: 'Improve matcher stability',
        author: 'dev-user',
        htmlUrl: 'https://github.com/acme/pullmatch/pull/42',
        repo: 'acme/pullmatch',
        prNumber: 42,
      },
      [{ login: 'alice', score: 12.3 }]
    );

    await assert.rejects(
      () => sendSlackNotification('https://hooks.slack.com/services/T000/B000/XXXX', message),
      (err: Error) => {
        assert.ok(err.message.includes('403'));
        return true;
      }
    );
  });
});
