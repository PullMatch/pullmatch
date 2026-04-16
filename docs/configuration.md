# PullMatch Configuration

PullMatch is configured via a `.pullmatch.yml` file in your repository root. All fields are optional — PullMatch uses sensible defaults when no config file is present.

## Full Example

```yaml
reviewers:
  count: 3
  exclude:
    - dependabot[bot]
    - ci-bot
  includeCodeowners: true
  autoAssign: false
  autoAssignCount: 2
  weights:
    codeowners: 0.4
    recency: 0.3
    frequency: 0.3
  loadBalancing: false
  maxOpenReviews: 5

ignore:
  - "**/*.lock"
  - "docs/**"
  - "*.generated.ts"

notifications:
  slack:
    webhookUrl: https://hooks.slack.com/services/T00/B00/xxx
    channel: "#code-review"
```

## Reference

### `reviewers`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `count` | integer | `3` | Number of reviewers to suggest per PR. Must be a positive integer. |
| `exclude` | string[] | `[]` | GitHub usernames to always exclude from suggestions. Case-insensitive. |
| `includeCodeowners` | boolean | `true` | Include CODEOWNERS file matches as a scoring signal. |
| `autoAssign` | boolean | `false` | Automatically request reviews from top-ranked reviewers via the GitHub API. |
| `autoAssignCount` | integer | `2` | How many reviewers to auto-assign when `autoAssign` is enabled. |
| `weights` | object | See below | Custom scoring weights for the matching algorithm. |
| `loadBalancing` | boolean | `false` | Reduce scores for reviewers who already have many open reviews. |
| `maxOpenReviews` | integer | `5` | When `loadBalancing` is enabled, reviewers at or above this count receive the maximum score penalty. |

### `reviewers.weights`

Control how much each signal contributes to the reviewer score. Each value must be a number between `0` and `1`.

| Key | Default | Description |
|-----|---------|-------------|
| `codeowners` | `0.4` | Weight for CODEOWNERS ownership signal. |
| `recency` | `0.3` | Weight for how recently someone committed to the changed files. |
| `frequency` | `0.3` | Weight for commit count (exact file + directory level). |

Weights are relative — they don't need to sum to 1. Higher values increase that signal's influence on the final score.

### `ignore`

A list of glob patterns (using [minimatch](https://github.com/isaacs/minimatch) syntax). Files matching any pattern are excluded from analysis.

```yaml
ignore:
  - "**/*.lock"
  - "**/*.snap"
  - "vendor/**"
```

### `notifications`

#### `notifications.slack`

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `webhookUrl` | string | Yes | Slack incoming webhook URL. |
| `channel` | string | No | Override the default channel for the webhook. |

## Default Behavior

When no `.pullmatch.yml` exists, PullMatch uses these defaults:

- Suggests **3 reviewers** per PR
- Includes **CODEOWNERS** signals
- Does **not** auto-assign reviewers
- Uses balanced weights: codeowners 0.4, recency 0.3, frequency 0.3
- No file ignore patterns
- No Slack notifications
- Load balancing **disabled**

## Validation

PullMatch validates the config file on every webhook event. Invalid values are silently replaced with defaults — a malformed config will never block your PR workflow.

- Integer fields must be positive integers
- Boolean fields must be `true` or `false`
- Weight values must be numbers between 0 and 1
- String arrays are filtered to only include valid strings
- If the YAML is unparseable, all defaults are used
