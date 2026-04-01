# Getting Started with PullMatch

PullMatch analyzes your pull requests and recommends the best reviewers based on real commit history, code ownership, and recent activity. It posts a comment on each PR with ranked suggestions and clear reasoning.

## Install

1. Go to the [PullMatch GitHub App](https://github.com/apps/pullmatch) and click **Install**.
2. Choose the organization or account you want to enable PullMatch for.
3. Select which repositories PullMatch should have access to (all or specific repos).

That's it. PullMatch starts working immediately — no configuration file required.

## What Happens Next

When a pull request is **opened** or **updated** (new commits pushed), PullMatch automatically:

1. Fetches the list of changed files from the PR.
2. Builds a contributor graph from commit history for those files and their parent directories.
3. Scores potential reviewers using file-level commits, directory-level commits, recency, and CODEOWNERS signals.
4. Posts (or updates) a comment on the PR with ranked reviewer suggestions.

If `autoAssign` is enabled in your config, PullMatch will also request reviews from the top-ranked reviewers via the GitHub API.

## Example PR Comment

Here's what PullMatch posts on your pull request:

```markdown
## PullMatch Reviewer Suggestions

Analyzed **Add user authentication middleware** and found 3 suggested reviewer(s)
based on code ownership and recent activity.

### @alice (score: 12.4) — API specialist, 8 commits
> **Context:**
> Primary contributor to the auth middleware and request validation layers.
- 6 commits to exact files changed in this PR
- 3 commits to parent directories
- Last commit 4 days ago
- Listed in CODEOWNERS for src/middleware/

### @bob (score: 8.2) — Backend, 5 commits
> **Context:**
> Active in the API routes and error handling modules.
- 3 commits to exact files changed in this PR
- 2 commits to parent directories
- Last commit 12 days ago

### @carol (score: 5.1) — Testing, 3 commits
- 1 commit to exact files changed in this PR
- 4 commits to parent directories
- Last commit 21 days ago
- Listed in CODEOWNERS for tests/

---
_Powered by PullMatch_
```

## Optional Configuration

PullMatch works with sensible defaults out of the box. To customize behavior, add a `.pullmatch.yml` file to your repository root. See the [Configuration Guide](configuration.md) for all available options.

## Next Steps

- [Configuration Guide](configuration.md) — customize reviewers, weights, ignore patterns, and notifications
- [FAQ](faq.md) — how scoring works, monorepo support, rate limits, and more
