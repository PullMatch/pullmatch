# PullMatch Configuration

PullMatch reserves `.pullmatch.yml` for repository-level configuration.

Current status: the production webhook/matcher pipeline does not yet read this file. This document defines the planned v1 schema so repositories can adopt a forward-compatible config now.

## Planned v1 Schema

```yaml
version: 1
reviewers:
  maxSuggestions: 3
  exclude: []
```

## Key Reference

| Key | Type | Default | Status | Description |
|---|---|---|---|---|
| `version` | number | `1` | Reserved | Configuration schema version. |
| `reviewers.maxSuggestions` | number | `3` | Reserved | Maximum number of reviewer suggestions to return per pull request. |
| `reviewers.exclude` | string[] | `[]` | Reserved | GitHub usernames to always exclude from reviewer suggestions. |

## Validation Rules (Planned)

- `version` must be `1`.
- `reviewers.maxSuggestions` must be an integer between `1` and `10`.
- `reviewers.exclude` entries must be valid GitHub login strings.

## Example

```yaml
version: 1
reviewers:
  maxSuggestions: 5
  exclude:
    - ci-bot
    - release-bot
```

## Additional Reserved Keys

These keys are planned for future Pro capabilities and are currently ignored:

- `autoAssign.enabled`
- `autoAssign.requireCodeOwner`
- `matching.weights.exact`
- `matching.weights.directory`
- `matching.weights.recency`
- `matching.weights.codeOwner`
