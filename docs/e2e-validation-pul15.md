# PUL-15: End-to-End Reviewer Suggestion Validation

**Date:** 2026-03-28
**Status:** PASS

## Summary

Validated that PullMatch produces correct reviewer suggestions on multi-contributor repos and handles edge cases gracefully. Found and fixed a bug where the CODEOWNERS scoring signal was collected but not integrated into the ranking formula.

## Bug Found & Fixed

The `codeOwner*4` bonus was missing from the scoring formula in `matcher.ts`. The contributor graph correctly gathered CODEOWNERS data (`isCodeOwner`, `codeOwnerFiles`) but the matcher only used `exact*3 + dir*1 + recency*2`. Fixed to include the full formula: `exact*3 + dir*1 + recency*2 + codeOwner*4`.

## Validation Results

### 1. Webhook Pipeline (End-to-End)

- **PR:** [PullMatch/pullmatch#11](https://github.com/PullMatch/pullmatch/pull/11)
- **Webhook received:** Yes (delivery `319bafc0-2a46-11f1-9f5a-c79fdd237725`)
- **Pipeline executed:** Fetched 3 changed files, queried 6 commit paths
- **Result:** "No reviewer candidates found" — correct since repo has only 1 contributor (rodchalski) who is the PR author
- **Logs confirm:** Full pipeline (signature verification → file fetch → graph build → author exclusion) works

### 2. Multi-Contributor Matching (microsoft/vscode)

Validated against `microsoft/vscode#304772` — 19 candidate reviewers found from commit history.

| Rank | Username | Score | Reasons |
|------|----------|-------|---------|
| 1 | @connor4312 | 18.93 | 4 exact commits, 5 dir commits, 3 days ago |
| 2 | @benibenj | 12.52 | 4 exact commits, 66 days ago |
| 3 | @roblourens | 10.77 | 2 exact commits, 3 dir commits, 10 days ago |

PR author `@bpasero` correctly excluded from results.

### 3. Edge Case Validation

| Test | Status | Detail |
|------|--------|--------|
| Empty graph (new files) | PASS | Returns 0 reviewers gracefully |
| CODEOWNERS rank highest | PASS | Code owners score >= commit-only candidates |
| CODEOWNERS beats fewer commits | PASS | Owner with 1 commit outranks non-owner with 3 |
| Author exclusion | PASS | Author excluded even with highest possible score |

### 4. Scoring Formula Verification

```
score = exactCommits × 3 + dirCommits × 1 + recencyScore × 2 + codeOwnerBonus × 4
```

- `exactCommits` (3x): Direct file ownership
- `dirCommits` (1x): Directory familiarity
- `recencyScore` (2x, [0,1]): Linear decay over 90 days
- `codeOwnerBonus` (4x): CODEOWNERS designation, per file
- Tie-break: Alphabetical by login (deterministic)

All weights verified via unit tests and live API validation.

## Test Coverage

- **Unit tests:** 9 matcher tests (including 2 new codeOwner tests), 5 contributor-graph tests, codeowners parser tests — all pass
- **Live validation:** microsoft/vscode#304772 with 19 candidates
- **Edge cases:** 4/4 pass
- **Webhook pipeline:** Confirmed via Fly.io production logs

## Artifacts

- `artifacts/match-validation.json` — Raw validation data
- `artifacts/match-validation.md` — Multi-contributor match results
- `artifacts/reviewer-scoring-validation.md` — Detailed scoring breakdown
- `artifacts/edge-case-validation.md` — Edge case test results

## Limitations

- Full end-to-end test with PullMatch comment on a PR requires a multi-contributor repo in the PullMatch org. The current PAT lacks repo-create permissions to set this up.
- CODEOWNERS scoring validated via unit tests and edge case scripts. Live CODEOWNERS validation against a real repo with matching CODEOWNERS entries would strengthen this further.
