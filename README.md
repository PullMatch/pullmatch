# PullMatch

PullMatch is the intelligence layer for software decisions.
It analyzes pull request changes and recommends the most relevant reviewers using deterministic repository signals.

## Features

- Smart reviewer matching from real commit history (exact-file + directory-level signals)
- Deterministic scoring with clear reasons in the PR comment
- PR author exclusion to prevent self-recommendation
- GitHub webhook integration for `pull_request.opened` and `pull_request.synchronize`
- Stable ranking with deterministic tie-breaking (alphabetical by username)

## Installation

PullMatch is currently in private beta.

- Join early access: <https://forms.gle/pullmatch-waitlist>
- GitHub App listing: <https://github.com/apps/pullmatch>
- Local app setup for development: [docs/github-app-setup.md](docs/github-app-setup.md)

## Configuration

Example:

```yaml
version: 1
reviewers:
  maxSuggestions: 3
  exclude:
    - dependabot[bot]
```

`.pullmatch.yml` is reserved for upcoming configuration support. The current webhook and matching pipeline does not yet consume this file.

See [docs/configuration.md](docs/configuration.md) for the current support status and forward-compatible key reference.

## How It Works

1. A pull request is opened or updated.
2. PullMatch fetches changed files from the GitHub API.
3. PullMatch builds a contributor graph from commit history for exact files and parent directories.
4. PullMatch scores reviewer candidates using:
   - exact file commits (weight 3)
   - directory commits (weight 1)
   - recency over a 90-day decay window (weight 2)
   - optional code owner bonus by matched file count (weight 4, when code owner signal is present)
5. PullMatch posts ranked reviewer suggestions as a PR comment with reasoning.

## Development

### Prerequisites

- Node.js 22+
- pnpm

### Install

```bash
pnpm install
```

### Run tests (shared core)

```bash
node --experimental-strip-types --test packages/shared/src/__tests__/*.test.ts
```
