# PullMatch Roadmap

Last updated: 2026-03-31

## Phase 1: Get Live

Goal: A working GitHub App that real teams can install and use.

- [x] Core matching algorithm (deterministic, validated)
- [x] GitHub webhook handler (signature verification, PR event parsing)
- [x] PR comment posting (formatted Markdown with reviewer recommendations)
- [x] CI pipeline (typecheck on push/PR)
- [x] Deploy API server to Fly.io (pullmatch-api-prod)
- [x] GitHub App registered (pullmatch-bot)
- [x] CODEOWNERS matching, team-aware suggestions, load balancing
- [x] Slack notifications (opt-in via .pullmatch.yml)
- [x] Stats API endpoints and telemetry
- [x] /health endpoint with diagnostics
- [ ] Set Fly.io secrets (PUL-55 — blocked, needs board action)
- [ ] Validate end-to-end in production (PUL-26 — blocked on secrets)

## Phase 2: PR Context Brief (current)

Goal: Give reviewers context alongside assignments — what changed, why it matters, what to look for.

- [ ] Context brief generator: per-reviewer summaries from commit messages + expertise (PUL-58)
- [ ] Integrate briefs into PR comment formatting (PUL-59)
- [ ] Track review outcomes via pull_request_review webhook (PUL-60)

## Phase 3: First Users

Goal: Get 3-5 teams using PullMatch on real repos.

- [ ] Outreach to teams with active open-source repos
- [ ] Collect feedback on match quality and usefulness
- [ ] Iterate on scoring weights based on real-world signal
- [ ] Improve web landing page with install flow

## Delivered (originally out of scope, now shipped)

- ~~Slack/Teams notifications~~ → shipped in Phase 1 (opt-in Slack webhooks)
- ~~Analytics dashboards~~ → stats API shipped (dashboard UI still future)

## Out of Scope

- Custom review policies or routing rules
- Multi-repo / monorepo logic
- Self-hosted / on-prem
- CI/CD merge gating
- User accounts / billing
