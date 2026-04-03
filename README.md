# PullMatch

**The intelligence layer for code review.** PullMatch analyzes pull requests and recommends the best reviewers using real commit history, code ownership, and recent activity.

[![GitHub App](https://img.shields.io/badge/GitHub%20App-Install-blue)](https://github.com/apps/pullmatch)

## Quick Start

1. **Install** the [PullMatch GitHub App](https://github.com/apps/pullmatch) on your organization or account.
2. **Open a pull request** — PullMatch automatically posts a comment with ranked reviewer suggestions.
3. **Optionally configure** by adding a [`.pullmatch.yml`](docs/configuration.md) to your repo root.

No setup required beyond installation. PullMatch works out of the box with sensible defaults.

## Features

- Smart reviewer matching from real commit history (exact-file + directory-level signals)
- Deterministic scoring with clear reasons in the PR comment
- CODEOWNERS integration — individual users and team entries
- Domain expertise tags (Frontend, API, Database, DevOps, Testing, etc.)
- Context briefs explaining why each reviewer is relevant
- Optional auto-assignment of reviewers via GitHub API
- Optional load balancing to distribute reviews evenly
- Slack notifications for new reviewer suggestions
- Graceful degradation under GitHub API rate limits
- Works with monorepos — directory-level analysis

## How It Works

1. A pull request is opened or updated.
2. PullMatch fetches changed files from the GitHub API.
3. A contributor graph is built from commit history for exact files and parent directories.
4. Reviewer candidates are scored using:
   - **Exact file commits** (weight 3) — direct file-level expertise
   - **Directory commits** (weight 1) — area familiarity
   - **Recency** (weight 2) — 90-day decay window
   - **CODEOWNERS bonus** (weight 4) — designated ownership
5. PullMatch posts ranked suggestions as a PR comment with per-reviewer reasoning.

## Documentation

- [Getting Started](docs/getting-started.md) — install, first PR, example output
- [Configuration](docs/configuration.md) — `.pullmatch.yml` reference, all options and defaults
- [FAQ](docs/faq.md) — scoring, monorepos, rate limits, auto-assign, and more
- [Local Development](docs/local-dev.md) — setting up the dev environment
- [GitHub App Setup](docs/github-app-setup.md) — creating your own GitHub App for development

## Development

### Prerequisites

- Node.js 22+
- pnpm

### Install

```bash
pnpm install
```

### Run tests

```bash
node --experimental-strip-types --test packages/shared/src/__tests__/*.test.ts
```

### Run API server

```bash
cd apps/api && pnpm dev
```

## License

MIT — see [LICENSE](LICENSE) for details.
