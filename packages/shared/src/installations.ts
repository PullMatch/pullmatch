export type InstallationAction = 'created' | 'deleted' | 'added' | 'removed';

export interface InstallationEvent {
  org: string;
  repos: string[];
  action: InstallationAction;
  installerLogin: string;
  installationId: number | null;
}

interface GitHubUser {
  login?: string | null;
  [key: string]: unknown;
}

interface GitHubRepository {
  full_name?: string;
  name?: string;
  owner?: GitHubUser | null;
}

interface InstallationPayload {
  action: string;
  installation?: {
    id?: number;
    account?: GitHubUser | null;
  };
  sender?: GitHubUser | null;
  repositories?: GitHubRepository[];
  repositories_added?: GitHubRepository[];
  repositories_removed?: GitHubRepository[];
}

function getOrg(payload: InstallationPayload, repos: string[]): string {
  const orgFromInstallation = payload.installation?.account?.login;
  if (orgFromInstallation && orgFromInstallation.length > 0) {
    return orgFromInstallation;
  }

  if (repos.length > 0 && repos[0].includes('/')) {
    return repos[0].split('/')[0] ?? 'unknown';
  }

  return 'unknown';
}

function normalizeRepos(repositories: GitHubRepository[] | undefined, orgHint: string | undefined): string[] {
  if (!repositories || repositories.length === 0) {
    return [];
  }

  return repositories.map((repository) => {
    if (repository.full_name && repository.full_name.length > 0) {
      return repository.full_name;
    }

    const repoName = repository.name ?? 'unknown-repo';
    const owner = repository.owner?.login ?? orgHint ?? 'unknown';
    return `${owner}/${repoName}`;
  });
}

export function parseInstallationEvent(payload: InstallationPayload): InstallationEvent | null {
  if (payload.action !== 'created' && payload.action !== 'deleted') {
    return null;
  }

  const orgHint = payload.installation?.account?.login ?? undefined;
  const repos = normalizeRepos(payload.repositories, orgHint);
  return {
    action: payload.action,
    repos,
    org: getOrg(payload, repos),
    installerLogin: payload.sender?.login ?? 'unknown',
    installationId: payload.installation?.id ?? null,
  };
}

export function parseInstallationRepositoriesEvent(payload: InstallationPayload): InstallationEvent | null {
  if (payload.action !== 'added' && payload.action !== 'removed') {
    return null;
  }

  const repositories = payload.action === 'added' ? payload.repositories_added : payload.repositories_removed;
  const orgHint = payload.installation?.account?.login ?? undefined;
  const repos = normalizeRepos(repositories, orgHint);

  return {
    action: payload.action,
    repos,
    org: getOrg(payload, repos),
    installerLogin: payload.sender?.login ?? 'unknown',
    installationId: payload.installation?.id ?? null,
  };
}

export function formatInstallationLog(event: InstallationEvent): Record<string, string | number | string[] | null> {
  return {
    category: 'github_installation',
    action: event.action,
    org: event.org,
    repos: event.repos,
    repoCount: event.repos.length,
    installerLogin: event.installerLogin,
    installationId: event.installationId,
  };
}
