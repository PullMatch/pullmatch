import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseInstallationEvent,
  parseInstallationRepositoriesEvent,
  formatInstallationLog,
} from '../installations.ts';

describe('parseInstallationEvent', () => {
  it('parses installation.created payload', () => {
    const parsed = parseInstallationEvent({
      action: 'created',
      installation: { id: 99, account: { login: 'acme' } },
      sender: { login: 'installer-user' },
      repositories: [{ full_name: 'acme/api' }, { full_name: 'acme/web' }],
    });

    assert.deepStrictEqual(parsed, {
      action: 'created',
      org: 'acme',
      repos: ['acme/api', 'acme/web'],
      installerLogin: 'installer-user',
      installationId: 99,
    });
  });

  it('returns null for unsupported action', () => {
    const parsed = parseInstallationEvent({ action: 'suspend' });
    assert.equal(parsed, null);
  });
});

describe('parseInstallationRepositoriesEvent', () => {
  it('parses installation_repositories.added payload', () => {
    const parsed = parseInstallationRepositoriesEvent({
      action: 'added',
      installation: { id: 42, account: { login: 'acme' } },
      sender: { login: 'maintainer' },
      repositories_added: [{ full_name: 'acme/new-repo' }],
    });

    assert.deepStrictEqual(parsed, {
      action: 'added',
      org: 'acme',
      repos: ['acme/new-repo'],
      installerLogin: 'maintainer',
      installationId: 42,
    });
  });

  it('parses removed repositories', () => {
    const parsed = parseInstallationRepositoriesEvent({
      action: 'removed',
      installation: { id: 42, account: { login: 'acme' } },
      repositories_removed: [{ full_name: 'acme/old-repo' }],
    });

    assert.deepStrictEqual(parsed, {
      action: 'removed',
      org: 'acme',
      repos: ['acme/old-repo'],
      installerLogin: 'unknown',
      installationId: 42,
    });
  });
});

describe('formatInstallationLog', () => {
  it('formats structured log payload', () => {
    const formatted = formatInstallationLog({
      action: 'created',
      org: 'acme',
      repos: ['acme/api'],
      installerLogin: 'installer-user',
      installationId: 7,
    });

    assert.deepStrictEqual(formatted, {
      category: 'github_installation',
      action: 'created',
      org: 'acme',
      repos: ['acme/api'],
      repoCount: 1,
      installerLogin: 'installer-user',
      installationId: 7,
    });
  });
});
