import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFile, buildExpertiseMap, formatExpertiseTag } from '../expertise.ts';
import type { ContributorEntry } from '../contributor-graph.ts';

function makeGraph(entries: ContributorEntry[]): Map<string, ContributorEntry> {
  const m = new Map<string, ContributorEntry>();
  for (const e of entries) m.set(e.login, e);
  return m;
}

const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

describe('classifyFile', () => {
  it('classifies frontend files', () => {
    assert.deepEqual(classifyFile('src/components/Button.tsx'), ['Frontend']);
    assert.deepEqual(classifyFile('styles/main.css'), ['Frontend']);
  });

  it('classifies API files', () => {
    assert.deepEqual(classifyFile('src/api/users.ts'), ['API']);
    assert.deepEqual(classifyFile('src/routes/health.ts'), ['API']);
  });

  it('classifies DevOps files', () => {
    assert.deepEqual(classifyFile('Dockerfile'), ['DevOps']);
    assert.deepEqual(classifyFile('fly.toml'), ['DevOps']);
    assert.deepEqual(classifyFile('.github/workflows/deploy.yml'), ['DevOps']);
  });

  it('classifies test files', () => {
    assert.deepEqual(classifyFile('src/__tests__/foo.test.ts'), ['Testing']);
  });

  it('classifies database files', () => {
    assert.deepEqual(classifyFile('src/migrations/001_init.sql'), ['Database']);
    assert.deepEqual(classifyFile('prisma/schema.prisma'), ['Database']);
  });

  it('returns multiple domains for overlapping patterns', () => {
    // A test file inside __tests__ with .test. extension matches Testing
    const domains = classifyFile('src/api/__tests__/users.test.ts');
    assert.ok(domains.includes('API'));
    assert.ok(domains.includes('Testing'));
  });

  it('returns empty array for unclassifiable files', () => {
    assert.deepEqual(classifyFile('src/utils/helpers.ts'), []);
  });
});

describe('buildExpertiseMap', () => {
  it('builds expertise from contributor graph and changed files', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 10, dirCommits: 2, latestCommit: recentDate },
      { login: 'bob', exactCommits: 3, dirCommits: 1, latestCommit: recentDate },
    ]);

    const files = [
      'src/api/users.ts',
      'src/api/auth.ts',
      'src/components/Login.tsx',
    ];

    const map = buildExpertiseMap(graph, files);

    assert.ok(map['alice']);
    assert.ok(map['alice'].length > 0);
    assert.ok(map['alice'].some((d) => d.domain === 'API'));
    assert.ok(map['bob']);
  });

  it('returns empty for contributors with zero commits', () => {
    const graph = makeGraph([
      { login: 'ghost', exactCommits: 0, dirCommits: 0, latestCommit: recentDate },
    ]);

    const map = buildExpertiseMap(graph, ['src/api/users.ts']);
    assert.equal(map['ghost'], undefined);
  });

  it('returns empty map when no files match any domain', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 5, dirCommits: 0, latestCommit: recentDate },
    ]);

    const map = buildExpertiseMap(graph, ['src/utils/helpers.ts']);
    assert.equal(map['alice'], undefined);
  });

  it('sorts domains by score descending', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 10, dirCommits: 0, latestCommit: recentDate },
    ]);

    // 3 API files, 1 frontend file -> API should score higher
    const files = [
      'src/api/users.ts',
      'src/api/auth.ts',
      'src/api/health.ts',
      'src/components/Button.tsx',
    ];

    const map = buildExpertiseMap(graph, files);
    assert.ok(map['alice']);
    assert.equal(map['alice'][0].domain, 'API');
  });
});

describe('formatExpertiseTag', () => {
  it('formats top expertise domain', () => {
    const map = {
      alice: [
        { domain: 'API', score: 12 },
        { domain: 'Frontend', score: 3 },
      ],
    };

    assert.equal(formatExpertiseTag('alice', map), 'API specialist, 12 commit(s)');
  });

  it('returns undefined for unknown user', () => {
    assert.equal(formatExpertiseTag('unknown', {}), undefined);
  });

  it('returns undefined for user with empty domains', () => {
    assert.equal(formatExpertiseTag('alice', { alice: [] }), undefined);
  });
});
