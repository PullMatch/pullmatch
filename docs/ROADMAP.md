# PullMatch Roadmap

Last updated: 2026-03-27

## Phase 1: Get Live (current)

Goal: A working GitHub App that real teams can install and use.

- [x] Core matching algorithm (deterministic, validated)
- [x] GitHub webhook handler (signature verification, PR event parsing)
- [x] PR comment posting (formatted Markdown with reviewer recommendations)
- [x] CI pipeline (typecheck on push/PR)
- [ ] Deploy API server (Railway/Fly/Render)
- [ ] Register GitHub App with live webhook URL
- [ ] Install on a test repo, validate end-to-end in production

## Phase 2: PR Context Brief

Goal: Feature #2 from MVP spec — give reviewers context, not just assignment.

- [ ] Generate short brief per reviewer: what changed, why it matters, what to look for
- [ ] Pull context from commit messages, linked issues, prior review threads
- [ ] Include brief in the PR comment alongside reviewer recommendation

## Phase 3: First Users

Goal: Get 3-5 teams using PullMatch on real repos.

- [ ] Outreach to teams with active open-source repos
- [ ] Collect feedback on match quality and usefulness
- [ ] Iterate on scoring weights based on real-world signal
- [ ] Improve web landing page with install flow

## Out of Scope (per MVP.md)

- Slack/Teams notifications
- Custom review policies or routing rules
- Multi-repo / monorepo logic
- Analytics dashboards
- Self-hosted / on-prem
- CI/CD merge gating
- User accounts / billing
