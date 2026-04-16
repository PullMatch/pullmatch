# Frequently Asked Questions

## How are reviewers scored?

PullMatch builds a score for each potential reviewer using four signals:

1. **Exact file commits** (weight: 3) — How many times someone committed to the exact files changed in the PR. This is the strongest signal of file-level expertise.
2. **Directory commits** (weight: 1) — Commits to the parent directories of changed files, indicating general area familiarity.
3. **Recency** (weight: 2) — A decay score based on how recently someone last committed. Commits within the last 90 days score proportionally higher; commits older than 90 days score zero.
4. **CODEOWNERS bonus** (weight: 4) — If `includeCodeowners` is enabled and a user is listed in your CODEOWNERS file for the changed paths, they receive a bonus per matched file.

Team-level CODEOWNERS entries (e.g., `@org/frontend-team`) also contribute a bonus (weight: 3) for each team member.

These weights can be customized via the `reviewers.weights` field in `.pullmatch.yml`. See the [Configuration Guide](configuration.md) for details.

## Does it work with monorepos?

Yes. PullMatch analyzes at the **directory level**, not just the repository level. Each changed file's parent directory is examined independently, so reviewers are matched based on their actual area of expertise within the repo.

For a PR that touches `packages/api/` and `packages/web/`, PullMatch will score contributors from each directory separately and surface the most relevant reviewers across the entire changeset.

## What about rate limits?

PullMatch handles GitHub API rate limits gracefully:

- **Warning threshold**: When fewer than 10 API requests remain, PullMatch logs a warning and adds a note to the PR comment.
- **Rate limit hit**: If the rate limit is fully exhausted, PullMatch posts a comment with the reset time so you know when analysis will resume.
- **Non-critical failures**: If optional data (commit messages, review load counts) can't be fetched, PullMatch continues with the data it has rather than failing entirely.
- **Server errors**: Retries automatically on 5XX errors (up to 3 times with exponential backoff).

PullMatch will never fail silently — if analysis is degraded, you'll see an "Analysis Notes" section in the PR comment explaining what happened.

## Can I exclude files or paths from analysis?

Yes. Add glob patterns to the `ignore` field in `.pullmatch.yml`:

```yaml
ignore:
  - "**/*.lock"
  - "**/*.snap"
  - "vendor/**"
  - "docs/**"
```

Patterns use [minimatch](https://github.com/isaacs/minimatch) syntax. Ignored files are excluded from the contributor graph, so they won't influence reviewer scores.

## Can I exclude specific users from suggestions?

Yes. Add usernames to `reviewers.exclude`:

```yaml
reviewers:
  exclude:
    - dependabot[bot]
    - ci-bot
    - intern-account
```

Exclusions are case-insensitive. Bot accounts (usernames starting with `bot-` or ending with `[bot]` or `-bot`) are also automatically filtered out.

## Does it request reviews automatically?

Not by default. To enable automatic review requests, set `autoAssign: true` in your config:

```yaml
reviewers:
  autoAssign: true
  autoAssignCount: 2
```

When enabled, PullMatch will call the GitHub API to request reviews from the top N ranked reviewers (controlled by `autoAssignCount`, default 2). The PR comment is still posted regardless.

## Does PullMatch use my CODEOWNERS file?

Yes, by default. PullMatch reads your repository's CODEOWNERS file and uses it as a scoring signal. Users listed as code owners for changed paths receive a score bonus.

Both individual users and team entries (`@org/team-name`) are supported. To disable this, set `includeCodeowners: false` in your config.

## What events trigger PullMatch?

PullMatch runs on two GitHub webhook events:

- **`pull_request.opened`** — When a new PR is created.
- **`pull_request.synchronize`** — When new commits are pushed to an existing PR.

On synchronize events, PullMatch updates its existing comment rather than posting a new one.

## Does it handle load balancing?

Optionally. When `loadBalancing` is enabled, PullMatch checks how many open review requests each candidate currently has and applies a score penalty for overloaded reviewers:

```yaml
reviewers:
  loadBalancing: true
  maxOpenReviews: 5
```

Reviewers at `maxOpenReviews` receive an 80% score reduction. This helps distribute review work more evenly across the team.

## What if there's no `.pullmatch.yml`?

PullMatch works out of the box with no configuration. It will suggest 3 reviewers per PR using balanced default weights, include CODEOWNERS signals, and skip auto-assignment. See the [Configuration Guide](configuration.md#default-behavior) for the full list of defaults.

## Does PullMatch store any data?

PullMatch does not store your source code. It reads commit history and changed files via the GitHub API at analysis time and posts results as PR comments. Analytics (event counts, response times) are tracked in-memory for operational monitoring.
